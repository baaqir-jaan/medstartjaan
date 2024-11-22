from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import re
from typing import Optional, List, Tuple

# Set up detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from physician_data import fetch_physician_data

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PhysicianRequest(BaseModel):
    search_term: str
    state: Optional[str] = None
    search_type: str = "name"

class BulkSearchRequest(BaseModel):
    names: List[str]
    state: Optional[str] = None

class BulkFileRequest(BaseModel):
    content: str
    state: Optional[str] = None

def parse_names_from_list(names: List[str]) -> List[Tuple[str, Optional[str]]]:
    """Parse names from a list."""
    results = []
    for line in names:
        try:
            name = re.sub(r'[^a-zA-Z\s]', '', line)
            name = ' '.join(name.split())

            if name and len(name.split()) >= 2:
                results.append((name, None))  # State can be None or extracted if included
                logger.info(f"Parsed: Name='{name}'")
        except Exception as e:
            logger.error(f"Error parsing name '{line}': {str(e)}")
            continue
    return results

def parse_names_from_file(content: str) -> List[Tuple[str, Optional[str]]]:
    """Parse names and states from file content."""
    try:
        # Remove RTF formatting if present
        if content.startswith('{\\rtf'):
            content = re.sub(r'\\[a-z]+[-]?\d*\s?', ' ', content)
            content = re.sub(r'[{}]', '', content)
            content = re.sub(r'\\\'[0-9a-f]{2}', '', content)
            content = content.replace('\\', '\n')

        lines = [line.strip() for line in content.splitlines() if line.strip()]
        
        results = []
        for line in lines:
            try:
                if ',' in line:
                    parts = [p.strip() for p in line.split(',')]
                    name = parts[0]
                    state = parts[1].strip('() ') if len(parts) > 1 else None
                elif ' (' in line and line.endswith(')'):
                    name = line[:line.rfind(' (')].strip()
                    state = line[line.rfind('(')+1:].strip(')')
                else:
                    name = line
                    state = None

                name = re.sub(r'[^a-zA-Z\s]', '', name)
                name = ' '.join(name.split())

                if name and len(name.split()) >= 2:
                    results.append((name, state))
                    logger.info(f"Parsed: Name='{name}', State='{state}'")

            except Exception as e:
                logger.error(f"Error parsing line '{line}': {str(e)}")
                continue

        return results
    except Exception as e:
        logger.error(f"Error parsing names: {str(e)}")
        raise

@app.post("/api/physicians/bulk")
async def process_bulk_names(request: BulkSearchRequest):
    try:
        logger.info("Starting bulk name processing")
        logger.info(f"Names received: {len(request.names)}")

        api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"

        parsed_names = parse_names_from_list(request.names)
        logger.info(f"Successfully parsed {len(parsed_names)} names")

        if not parsed_names:
            logger.warning("No valid names found")
            return []

        results = []
        for name, _ in parsed_names:
            try:
                logger.info(f"Processing: {name} ({request.state if request.state else 'no state'})")
                result = fetch_physician_data(
                    api_url=api_url,
                    physician_name=name,
                    state=request.state,
                    search_type="name"
                )
                if result:
                    results.append(result)
                    logger.info(f"Found data for {name}")
                else:
                    logger.info(f"No data found for {name}")
            except Exception as e:
                logger.error(f"Error processing {name}: {str(e)}")
                continue

        logger.info(f"Bulk processing complete. Found {len(results)} matches")
        return results

    except Exception as e:
        logger.error(f"Error in bulk processing: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/physicians/bulk_file")
async def process_file(request: BulkFileRequest):
    try:
        logger.info("Starting bulk file processing")
        logger.info(f"File content preview: {request.content[:200]}...")
        
        api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"
        
        parsed_names = parse_names_from_file(request.content)
        logger.info(f"Successfully parsed {len(parsed_names)} names from file")
        
        if not parsed_names:
            logger.warning("No valid names found in file")
            return []
        
        results = []
        for name, state in parsed_names:
            try:
                logger.info(f"Processing: {name} ({state if state else 'no state'})")
                result = fetch_physician_data(
                    api_url=api_url,
                    physician_name=name,
                    state=state or request.state,
                    search_type="name"
                )
                if result:
                    results.append(result)
                    logger.info(f"Found data for {name}")
                else:
                    logger.info(f"No data found for {name}")
            except Exception as e:
                logger.error(f"Error processing {name}: {str(e)}")
                continue
        
        logger.info(f"Bulk processing complete. Found {len(results)} matches")
        return results
    
    except Exception as e:
        logger.error(f"Error in bulk processing: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

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
    logger.info("Starting server...")
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
