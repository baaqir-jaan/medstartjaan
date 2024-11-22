import requests
import pandas as pd

# Define the API URL
api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"

# Define the query parameters to get a larger dataset
params = {
    "columns": ["Rndrng_NPI", "Rndrng_Prvdr_Last_Org_Name", "Rndrng_Prvdr_First_Name", "Tot_Benes", "Tot_Mdcr_Alowd_Amt"],
    "limit": 1000  # Increase the limit to retrieve more results
}

# Send the API request
response = requests.get(api_url, params=params)

# Check if the request was successful
if response.status_code == 200:
    data = response.json()  # Parse the JSON data

    # Manually filter the results for "Ashley Fry"
    records = []
    for record in data:
        first_name = record.get('Rndrng_Prvdr_First_Name', '').strip().lower()
        last_name = record.get('Rndrng_Prvdr_Last_Org_Name', '').strip().lower()

        if ("ashley" in first_name and "fry" in last_name):
            records.append({
                'NPI': record.get('Rndrng_NPI'),
                'First Name': record.get('Rndrng_Prvdr_First_Name'),
                'Last Name': record.get('Rndrng_Prvdr_Last_Org_Name'),
                'Tot_Benes': record.get('Tot_Benes'),
                'Tot_Mdcr_Alowd_Amt': record.get('Tot_Mdcr_Alowd_Amt')
            })

    if records:
        # Create a DataFrame and save it to a CSV file
        df = pd.DataFrame(records)
        df.to_csv('cms_data.csv', index=False)
        print(f"Data saved to cms_data.csv with {len(records)} matches for 'Ashley Fry'.")
    else:
        print("No exact match found for Ashley Fry.")
else:
    print("Error:", response.status_code)
