from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import re
from typing import Optional, List, Tuple
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

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

# Models
class PhysicianRequest(BaseModel):
    search_term: str
    state: Optional[str] = None
    search_type: str = "name"

class ReportRequest(BaseModel):
    email: str
    calculationResults: dict
    providerData: dict

def fetch_physician_data(api_url: str, physician_name: str, search_type: str = "name", state: Optional[str] = None):
    """Fetch physician data from CMS API"""
    timeout = 30
    
    # Setup retry strategy
    retry_strategy = Retry(
        total=3,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    http = requests.Session()
    http.mount("https://", adapter)
    http.mount("http://", adapter)

    try:
        logger.info(f"Searching by {search_type}: {physician_name} in state: {state}")
        
        if search_type == "npi":
            params = {
                'filter[Rndrng_NPI]': physician_name,
                'size': 5000,
                'offset': 0
            }
        else:
            # Handle name search
            name_parts = physician_name.split(maxsplit=1)
            if len(name_parts) == 2:
                first_name, last_name = name_parts
            else:
                first_name, last_name = "", name_parts[0]
                
            params = {
                'filter[Rndrng_Prvdr_Last_Org_Name]': last_name,
                'size': 5000,
                'offset': 0
            }

        logger.info(f"Making API request with params: {params}")
        response = http.get(api_url, params=params, timeout=timeout)
        response.raise_for_status()
        
        data = response.json()
        logger.info(f"Received {len(data)} results")

        if not data:
            return None

        if search_type == "npi":
            # For NPI search, return the first match
            if data:
                result = data[0]
                return {
                    'name': f"{result['Rndrng_Prvdr_First_Name']} {result['Rndrng_Prvdr_Last_Org_Name']}",
                    'Tot_Benes': result.get('Tot_Benes', 'N/A'),
                    'Tot_Mdcr_Alowd_Amt': result.get('Tot_Mdcr_Alowd_Amt', 'N/A'),
                    'NPI': result.get('Rndrng_NPI', 'N/A'),
                    'State': result.get('Rndrng_Prvdr_State_Abrvtn', 'N/A')
                }
        else:
            # For name search, look for exact matches
            for result in data:
                if (result['Rndrng_Prvdr_Last_Org_Name'].lower() == last_name.lower() and
                    result['Rndrng_Prvdr_First_Name'].lower() == first_name.lower()):
                    if not state or result.get('Rndrng_Prvdr_State_Abrvtn', '').upper() == state.upper():
                        logger.info(f"Found match: {result['Rndrng_Prvdr_First_Name']} {result['Rndrng_Prvdr_Last_Org_Name']}")
                        return {
                            'name': f"{result['Rndrng_Prvdr_First_Name']} {result['Rndrng_Prvdr_Last_Org_Name']}",
                            'Tot_Benes': result.get('Tot_Benes', 'N/A'),
                            'Tot_Mdcr_Alowd_Amt': result.get('Tot_Mdcr_Alowd_Amt', 'N/A'),
                            'NPI': result.get('Rndrng_NPI', 'N/A'),
                            'State': result.get('Rndrng_Prvdr_State_Abrvtn', 'N/A')
                        }

        return None

    except Exception as e:
        logger.error(f"Error fetching physician data: {str(e)}")
        raise

@app.post("/api/send-report")
async def send_report(request: ReportRequest):
    try:
        logger.info(f"Attempting to send email to: {request.email}")
        
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_username = os.getenv("SMTP_USERNAME")
        smtp_password = os.getenv("SMTP_PASSWORD")
        sender_email = os.getenv("SENDER_EMAIL")

        if not all([smtp_username, smtp_password, sender_email]):
            logger.error("Email configuration missing")
            raise HTTPException(status_code=500, detail="Email configuration missing")

        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = request.email
        msg['Subject'] = "Your CCM Financial Pro Forma"

        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2c5282;">Your CCM Financial Pro Forma</h2>
            <p>Thank you for using our CCM Calculator. Here are your detailed results:</p>
            
            <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2d3748;">Provider Information</h3>
                <p>Name: {request.providerData.get('name', 'N/A')}</p>
                <p>NPI: {request.providerData.get('npi', 'N/A')}</p>
                <p>Total Medicare Patients: {request.providerData.get('totalPatients', 0):,}</p>
            </div>
            
            <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2d3748;">CCM Program Metrics</h3>
                <p>Medicare Patients: {request.providerData.get('totalPatients', 0):,}</p>
                <p>CCM-Eligible Patients (80%): {int(request.providerData.get('totalPatients', 0) * 0.8):,}</p>
                <p>Expected Enrollment (50% of eligible): {request.calculationResults.get('enrolledPatients', 0):,}</p>
            </div>
            
            <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2d3748;">Financial Projections</h3>
                <p>Revenue Per Visit: $50</p>
                <p>Average Visits Per Year: 10</p>
                <p>Annual Revenue Per Patient: $500</p>
                <p>Total Annual Revenue: ${request.calculationResults.get('annualRevenue', 0):,.2f}</p>
                <p>Profit Margin: 45%</p>
                <p>Projected Annual Profit: ${request.calculationResults.get('annualProfit', 0):,.2f}</p>
            </div>
            
            <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #2d3748;">Program Assumptions</h3>
                <ul>
                    <li>80% of Medicare patients typically qualify for CCM</li>
                    <li>50% average enrollment rate with proper implementation</li>
                    <li>$50 average reimbursement per billable event</li>
                    <li>10 billable events per year per patient</li>
                    <li>45% profit margin with turnkey solution</li>
                </ul>
            </div>
            
            <p style="margin-top: 30px;">For more information about implementing a successful CCM program, 
            please contact our team.</p>
        </body>
        </html>
        """

        msg.attach(MIMEText(body, 'html'))

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

        return {"message": "Report sent successfully"}

    except Exception as e:
        logger.error(f"Error sending report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

if __name__ == "__main__":
    logger.info("Starting server...")
    uvicorn.run("cms_calc:app", host="0.0.0.0", port=8000, reload=True)