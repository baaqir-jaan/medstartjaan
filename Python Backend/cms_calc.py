# cms_calc.py

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import os
from dotenv import load_dotenv
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from typing import Optional, Dict, Any
from uuid import uuid4
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for calculation data; replace with a database in production
calculation_data_store = {}

# Models
class PhysicianRequest(BaseModel):
    search_term: str
    state: Optional[str] = None
    search_type: str = "name"

class ReportRequest(BaseModel):
    email: str
    calc_id: str

@app.post("/api/physician")
async def search_physician(request: PhysicianRequest):
    try:
        logger.info(f"Searching by {request.search_type}: {request.search_term}")
        api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"

        result = fetch_physician_data(
            api_url=api_url,
            physician_name=request.search_term,
            search_type=request.search_type,
            state=request.state
        )

        if result is None:
            raise HTTPException(
                status_code=404,
                detail=f"No physician found with {request.search_type} '{request.search_term}'"
            )

        return result
    except Exception as e:
        logger.error(f"Error occurred: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))

def fetch_physician_data(
    api_url: str,
    physician_name: str,
    search_type: str = "name",
    state: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Fetch physician data from CMS API
    """
    # Setup retry strategy
    retry_strategy = Retry(
        total=3,  # number of retries
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        if search_type == "npi":
            # Direct NPI lookup
            logger.info(f"Making API request for NPI: {physician_name}")
            params = {
                'filter[Rndrng_NPI]': physician_name,
                'size': 1  # We only need one result for NPI
            }
        else:
            # Name-based search
            name_parts = physician_name.split(maxsplit=1)
            if len(name_parts) == 2:
                first_name, last_name = name_parts
            else:
                last_name = name_parts[0]
                first_name = ""

            logger.info(f"Making API request for name: {first_name} {last_name}")
            params = {
                'filter[Rndrng_Prvdr_Last_Org_Name]': last_name,
                'size': 5000
            }

        # Add state filter if provided
        if state:
            params['filter[Rndrng_Prvdr_State_Abrvtn]'] = state.upper()

        # Make API request
        response = session.get(
            api_url,
            params=params,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        logger.info(f"Received {len(data)} results from API")

        if not data:
            logger.info("No results found")
            return None

        # For NPI search, return first match
        if search_type == "npi":
            if data:
                result = data[0]
                return {
                    'name': f"{result['Rndrng_Prvdr_First_Name']} {result['Rndrng_Prvdr_Last_Org_Name']}",
                    'Tot_Benes': int(result.get('Tot_Benes', 0)),
                    'Tot_Mdcr_Alowd_Amt': float(result.get('Tot_Mdcr_Alowd_Amt', 0)),
                    'NPI': result.get('Rndrng_NPI'),
                    'State': result.get('Rndrng_Prvdr_State_Abrvtn')
                }
            return None

        # For name search, look for exact match
        for result in data:
            if search_type == "name":
                if (result['Rndrng_Prvdr_Last_Org_Name'].lower() == last_name.lower() and
                    (not first_name or result['Rndrng_Prvdr_First_Name'].lower().startswith(first_name.lower()))):

                    logger.info(f"Found match: {result['Rndrng_Prvdr_First_Name']} {result['Rndrng_Prvdr_Last_Org_Name']}")
                    return {
                        'name': f"{result['Rndrng_Prvdr_First_Name']} {result['Rndrng_Prvdr_Last_Org_Name']}",
                        'Tot_Benes': int(result.get('Tot_Benes', 0)),
                        'Tot_Mdcr_Alowd_Amt': float(result.get('Tot_Mdcr_Alowd_Amt', 0)),
                        'NPI': result.get('Rndrng_NPI'),
                        'State': result.get('Rndrng_Prvdr_State_Abrvtn')
                    }

        logger.info("No exact matches found")
        return None

    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error processing physician data: {str(e)}")
        raise

@app.post("/api/store-calculation")
async def store_calculation(data: dict):
    calc_id = str(uuid4())
    calculation_data_store[calc_id] = data
    return {"calc_id": calc_id}

@app.post("/api/hubspot-webhook")
async def hubspot_webhook(request: Request):
    try:
        data = await request.json()
        email = data.get('email')
        calc_id = data.get('calc_id')

        if not email or not calc_id:
            logger.error('Missing email or calc_id in webhook data.')
            raise HTTPException(status_code=400, detail='Missing email or calc_id.')

        # Retrieve calculation data
        calculation_results = calculation_data_store.get(calc_id)

        if not calculation_results:
            logger.error('Calculation data not found for calc_id.')
            raise HTTPException(status_code=404, detail='Calculation data not found.')

        # Generate PDF report
        pdf_report = generate_pdf_report(calculation_results)

        # Send email with the report attached
        send_email_with_attachment(
            recipient=email,
            subject="Your CCM Financial Pro Forma",
            body="Please find your detailed pro forma report attached.",
            attachment=pdf_report,
            attachment_filename="Pro_Forma_Report.pdf"
        )

        return {"message": "Report sent successfully"}
    except Exception as e:
        logger.error(f"Error sending report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def generate_pdf_report(calculation_results):
    # Implement PDF generation logic here
    # For simplicity, we'll create a basic PDF using reportlab
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from io import BytesIO

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    textobject = c.beginText(50, height - 50)
    textobject.setFont("Helvetica", 12)

    textobject.textLine("CCM Financial Pro Forma Report")
    textobject.textLine("")

    textobject.textLine("Providers Found:")
    for provider in calculation_results['providers']:
        textobject.textLine(f"- {provider['name']} (NPI: {provider['npi']}) - Patients: {provider['totalPatients']:,}")

    if calculation_results.get('notFoundNPIs'):
        textobject.textLine("")
        textobject.textLine("NPIs Not Found:")
        for npi in calculation_results['notFoundNPIs']:
            textobject.textLine(f"- {npi}")

    textobject.textLine("")
    textobject.textLine(f"Total Medicare Patients: {calculation_results['totalPatients']:,}")
    textobject.textLine(f"CCM-Eligible Patients (80%): {int(calculation_results['totalPatients'] * 0.8):,}")
    textobject.textLine(f"Expected Enrollment (50% of eligible): {calculation_results['enrolledPatients']:,}")
    textobject.textLine("")
    textobject.textLine(f"Total Annual Revenue: ${calculation_results['annualRevenue']:,.2f}")
    textobject.textLine(f"Projected Annual Profit: ${calculation_results['annualProfit']:,.2f}")

    c.drawText(textobject)
    c.showPage()
    c.save()

    pdf_value = buffer.getvalue()
    buffer.close()
    return pdf_value

def send_email_with_attachment(recipient, subject, body, attachment, attachment_filename):
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    sender_email = os.getenv("SENDER_EMAIL")

    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = recipient
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'plain'))

    part = MIMEApplication(attachment, Name=attachment_filename)
    part['Content-Disposition'] = f'attachment; filename="{attachment_filename}"'
    msg.attach(part)

    try:
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            logger.info("Connecting to SMTP server...")
            server.starttls()
            logger.info("Logging into SMTP server...")
            server.login(smtp_username, smtp_password)
            logger.info("Sending email...")
            server.send_message(msg)
            logger.info("Email sent successfully!")
    except Exception as e:
        logger.error(f"SMTP Error: {str(e)}")
        raise

if __name__ == "__main__":
    logger.info("Starting server...")
    uvicorn.run("cms_calc:app", host="0.0.0.0", port=8000, reload=True)
