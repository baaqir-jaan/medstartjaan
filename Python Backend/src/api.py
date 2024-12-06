import requests
import logging
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
from typing import Optional, Dict, Any
from flask import Flask
# Add any required CORS settings
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Ensure you have a port configuration that works with Railway
port = os.environ.get('PORT', 5000)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=port)

logger = logging.getLogger(__name__)

def fetch_physician_data(
    api_url: str, 
    physician_name: str, 
    search_type: str = "name",
    state: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Fetch physician data from CMS API
    
    Args:
        api_url: CMS API endpoint
        physician_name: NPI number or physician name
        search_type: "npi" or "name"
        state: Optional state filter
    
    Returns:
        Dictionary with physician data or None if not found
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