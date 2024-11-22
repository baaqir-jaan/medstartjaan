from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging

# Import functions from your original file
# Replace 'your_existing_file' with the actual name of your Python script (without .py)
from your_existing_file import fetch_physician_data, extract_names_from_rtf

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PhysicianRequest(BaseModel):
    name: str

@app.post("/api/physician")
async def search_physician(request: PhysicianRequest):
    try:
        logger.info(f"Searching for physician: {request.name}")
        api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"
        result = fetch_physician_data(api_url, request.name)
        
        if result is None:
            raise HTTPException(status_code=404, detail="Physician not found")
        return result
    except Exception as e:
        logger.error(f"Error occurred: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    logger.info("Starting server...")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)