import requests
import pandas as pd

# Define the API URL
api_url = "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data"

# Define the query parameters
params = {
    "Rndrng_Prvdr_First_Name": "Ashley",  # Example physician's first name
    "Rndrng_Prvdr_Last_Org_Name": "Fry",  # Example physician's last name
    "columns": ["Rndrng_NPI", "Rndrng_Prvdr_Last_Org_Name", "Rndrng_Prvdr_First_Name", "Tot_Benes", "Tot_Mdcr_Alowd_Amt"],
    "limit": 10  # Limits the number of results
}

# Send the API request
response = requests.get(api_url, params=params)

# Check if the request was successful
if response.status_code == 200:
    data = response.json()  # Parse the JSON data
    # Extract relevant data and store it in a DataFrame
    records = []
    for item in data['records']:
        records.append({
            'NPI': item.get('Rndrng_NPI'),
            'First Name': item.get('Rndrng_Prvdr_First_Name'),
            'Last Name': item.get('Rndrng_Prvdr_Last_Org_Name'),
            'Tot_Benes': item.get('Tot_Benes'),
            'Tot_Mdcr_Alowd_Amt': item.get('Tot_Mdcr_Alowd_Amt')
        })
    df = pd.DataFrame(records)
    df.to_csv('cms_data.csv', index=False)
    print("Data saved to cms_data.csv")
else:
    print("Error:", response.status_code)
