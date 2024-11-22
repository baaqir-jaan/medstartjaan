import requests
import csv
import os
from datetime import datetime
import re
import json
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

def extract_names_from_rtf(rtf_content):
    clean_content = re.sub(r'\\[a-z]+[-]?\d*\s?', '', rtf_content)
    clean_content = re.sub(r'[{}]', '', clean_content)
    names = [name.strip() for name in clean_content.split('\\') if name.strip()]
    names = [name for name in names if re.match(r'^[A-Za-z\s]+$', name)]
    return names

def fetch_physician_data(api_url, physician_name):
    offset = 0
    page_size = 5000  # Keep the page size at 5000, but we'll go through all pages
    max_pages = 100  # Set a reasonable maximum number of pages to prevent infinite loops
    timeout = 30
    
    name_parts = physician_name.split(maxsplit=1)
    if len(name_parts) == 2:
        first_name, last_name = name_parts
    else:
        first_name, last_name = "", name_parts[0]

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

    potential_matches = []

    for page in range(max_pages):
        params = {
            'filter[Rndrng_Prvdr_Last_Org_Name]': last_name,
            'size': page_size,
            'offset': offset
        }

        try:
            print(f"Making API request for {physician_name} with offset {offset}")
            response = http.get(api_url, params=params, timeout=timeout)
            response.raise_for_status()
            
            print(f"Response status code: {response.status_code}")

            data = response.json()

            if not data:
                print("No more data received from API")
                break
            
            print(f"Received {len(data)} results")
            
            # Look for exact and partial matches
            for r in data:
                if r['Rndrng_Prvdr_Last_Org_Name'].lower() == last_name.lower():
                    if r['Rndrng_Prvdr_First_Name'].lower() == first_name.lower():
                        # Exact match
                        return {
                            'name': f"{r['Rndrng_Prvdr_First_Name']} {r['Rndrng_Prvdr_Last_Org_Name']}",
                            'Tot_Benes': r.get('Tot_Benes', 'N/A'),
                            'Tot_Mdcr_Alowd_Amt': r.get('Tot_Mdcr_Alowd_Amt', 'N/A'),
                            'NPI': r.get('Rndrng_NPI', 'N/A')
                        }
                    elif first_name.lower() in r['Rndrng_Prvdr_First_Name'].lower():
                        # Partial match on first name
                        potential_matches.append(r)
            
            if len(data) < page_size:
                print(f"Reached end of data for {physician_name}")
                break
            
            offset += page_size
            time.sleep(1)  # Add a small delay between requests
            
        except requests.RequestException as e:
            print(f"Error making request: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response status code: {e.response.status_code}")
                print(f"Response content: {e.response.text[:200]}...")
            time.sleep(2)  # Wait a bit longer before retrying

    # If no exact match found, return the first potential match or None
    if potential_matches:
        best_match = potential_matches[0]
        print(f"No exact match found for {physician_name}. Returning best potential match.")
        return {
            'name': f"{best_match['Rndrng_Prvdr_First_Name']} {best_match['Rndrng_Prvdr_Last_Org_Name']}",
            'Tot_Benes': best_match.get('Tot_Benes', 'N/A'),
            'Tot_Mdcr_Alowd_Amt': best_match.get('Tot_Mdcr_Alowd_Amt', 'N/A'),
            'NPI': best_match.get('Rndrng_NPI', 'N/A')
        }
    
    print(f"No matches found for {physician_name}")
    return None

def get_physician_names():
    file_path = 'physician_names.txt'
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found.")
        return []

    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    
    names = extract_names_from_rtf(content)
    print(f"Extracted {len(names)} names.")
    return names

def export_to_csv(results):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"physician_data_{timestamp}.csv"
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['Name', 'NPI', 'Total Beneficiaries', 'Total Medicare Allowed Amount']  # Added NPI
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        for result in results:
            writer.writerow({
                'Name': result['name'],
                'NPI': result['NPI'],  # Added NPI
                'Total Beneficiaries': result['Tot_Benes'],
                'Total Medicare Allowed Amount': result['Tot_Mdcr_Alowd_Amt']
            })
    
    print(f"Results exported to {filename}")

def main():
    api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"
    
    physician_names = get_physician_names()
    
    if not physician_names:
        print("No physician names found. Exiting.")
        return

    print(f"Found {len(physician_names)} physician names.")
    
    results = []
    for name in physician_names:
        print(f"Processing: {name}")
        result = fetch_physician_data(api_url, name)
        if result:
            print(f"Name: {result['name']}")
            print(f"NPI: {result['NPI']}")  # Added NPI output
            print(f"Total Beneficiaries: {result['Tot_Benes']}")
            print(f"Total Medicare Allowed Amount: {result['Tot_Mdcr_Alowd_Amt']}")
            results.append(result)
        else:
            print(f"No data found for {name}")
        print("---")
    
    if results:
        export_to_csv(results)
    else:
        print("No results to export.")

if __name__ == "__main__":
    main()