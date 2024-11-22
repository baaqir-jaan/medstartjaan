import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fetch_physician_data(api_url, physician_name, state=None, search_type="name"):
    try:
        logger.info(f"Searching by {search_type}: {physician_name} in state: {state}")
        offset = 0
        page_size = 5000
        timeout = 30

        retry_strategy = Retry(
            total=3,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        http = requests.Session()
        http.mount("https://", adapter)
        http.mount("http://", adapter)

        params = {
            'size': page_size,
            'offset': offset
        }

        # Handle different search types
        if search_type == "npi":
            params['filter[Rndrng_NPI]'] = physician_name
        else:
            # Name search logic
            name_parts = physician_name.split(maxsplit=1)
            if len(name_parts) == 2:
                first_name, last_name = name_parts
            else:
                first_name, last_name = "", name_parts[0]
            params['filter[Rndrng_Prvdr_Last_Org_Name]'] = last_name

        if state:
            params['filter[Rndrng_Prvdr_State_Abrvtn]'] = state.upper()

        logger.info(f"Making API request with params: {params}")
        response = http.get(api_url, params=params, timeout=timeout)
        response.raise_for_status()
        
        data = response.json()
        logger.info(f"Received {len(data) if data else 0} results")
        
        if not data:
            return None
        
        for r in data:
            if search_type == "npi":
                # For NPI search, exact match on NPI
                matches = (r['Rndrng_NPI'] == physician_name and
                         (not state or r.get('Rndrng_Prvdr_State_Abrvtn', '').upper() == state.upper()))
            else:
                # For name search, match on first and last name
                matches = (r['Rndrng_Prvdr_Last_Org_Name'].lower() == last_name.lower() and
                         r['Rndrng_Prvdr_First_Name'].lower() == first_name.lower() and
                         (not state or r.get('Rndrng_Prvdr_State_Abrvtn', '').upper() == state.upper()))

            if matches:
                logger.info(f"Found match: {r['Rndrng_Prvdr_First_Name']} {r['Rndrng_Prvdr_Last_Org_Name']}")
                return {
                    'name': f"{r['Rndrng_Prvdr_First_Name']} {r['Rndrng_Prvdr_Last_Org_Name']}",
                    'Tot_Benes': r.get('Tot_Benes', 'N/A'),
                    'Tot_Mdcr_Alowd_Amt': r.get('Tot_Mdcr_Alowd_Amt', 'N/A'),
                    'NPI': r.get('Rndrng_NPI', 'N/A'),
                    'State': r.get('Rndrng_Prvdr_State_Abrvtn', 'N/A')
                }
        
        logger.info("No match found")
        return None

    except Exception as e:
        logger.error(f"Error in fetch_physician_data: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Response status: {e.response.status_code}")
            logger.error(f"Response content: {e.response.text[:200]}")
        raise