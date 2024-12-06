import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
from typing import Optional
from physician_data import fetch_physician_data

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PhysicianRequest(BaseModel):
    search_term: str
    state: Optional[str] = None
    search_type: str = "name"

@app.get("/")
async def home():
    return {"message": "Medicare Revenue Calculator API is running"}

@app.post("/api/physician")
async def search_physician(request: PhysicianRequest):
    try:
        logger.info(f"Searching by {request.search_type}: {request.search_term} (State: {request.state})")
        api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"
        
        result = fetch_physician_data(
            api_url=api_url,
            physician_name=request.search_term,
            state=request.state,
            search_type=request.search_type
        )
        
        if result is None:
            message = (
                f"No physician found with {'NPI' if request.search_type == 'npi' else 'name'} "
                f"'{request.search_term}'{' in ' + request.state if request.state else ''}"
            )
            raise HTTPException(status_code=404, detail=message)
            
        return result
    except Exception as e:
        logger.error(f"Error occurred: {str(e)}", exc_info=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))