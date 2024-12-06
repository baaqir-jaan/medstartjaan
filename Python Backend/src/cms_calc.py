import os
import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
from typing import Optional, Dict, Any

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update this with your Vercel URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PhysicianRequest(BaseModel):
    search_term: str
    state: Optional[str] = None
    search_type: str = "name"

def fetch_physician_data(
    api_url: str,
    physician_name: str,
    search_type: str = "name",
    state: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    try:
        if search_type == "npi":
            logger.info(f"Making API request for NPI: {physician_name}")
            params = {
                "filter[Rndrng_NPI]": physician_name,
                "size": 1
            }
        else:
            name_parts = physician_name.split(maxsplit=1)
            if len(name_parts) == 2:
                first_name, last_name = name_parts
            else:
                last_name = name_parts[0]
                first_name = ""

            params = {
                "filter[Rndrng_Prvdr_Last_Org_Name]": last_name,
                "size": 5000
            }

        if state:
            params["filter[Rndrng_Prvdr_State_Abrvtn]"] = state.upper()

        response = requests.get(
            api_url,
            params=params,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        
        if not data:
            return None

        if search_type == "npi" and data:
            result = data[0]
            return {
                "name": f"{result["Rndrng_Prvdr_First_Name"]} {result["Rndrng_Prvdr_Last_Org_Name"]}",
                "Tot_Benes": int(result.get("Tot_Benes", 0)),
                "Tot_Mdcr_Alowd_Amt": float(result.get("Tot_Mdcr_Alowd_Amt", 0)),
                "NPI": result.get("Rndrng_NPI"),
                "State": result.get("Rndrng_Prvdr_State_Abrvtn")
            }

        return None

    except Exception as e:
        logger.error(f"Error fetching physician data: {str(e)}")
        raise

@app.get("/")
async def home():
    return {"message": "Medicare Revenue Calculator API is running"}

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
                detail=f"No physician found with {request.search_type} \"{request.search_term}\""
            )
            
        return result
    except Exception as e:
        logger.error(f"Error occurred: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
