import pandas as pd

# Load the CSV file
# Assuming 'data/data.csv' is the correct path to your input file
try:
    df = pd.read_csv("data/data.csv")
except FileNotFoundError:
    print("Error: data/data.csv not found. Please ensure the file exists in the 'data' subdirectory.")
    exit()

# Clean column names (convert to lowercase and strip whitespace)
df.columns = [c.strip().lower() for c in df.columns]

# --- 1. Create Regions Table (regions.csv) ---
# Get unique region names from both origin and destination region columns
region_names_series = pd.concat([df['region_orig'], df['region_dest']]).dropna().unique()
regions = pd.DataFrame({
    'region_name': region_names_series
})
regions = regions.sort_values(by='region_name').reset_index(drop=True) # Sort for consistent IDs
regions.insert(0, 'region_id', range(1, len(regions) + 1))

# Create a mapping from region name to region_id
region_name_to_id_map = dict(zip(regions['region_name'], regions['region_id']))

# --- 2. Create Countries Table (countries.csv) ---
# Extract all unique country-ISO pairs from origin and destination fields
countries_orig = df[['country_orig', 'country_orig_id']].rename(
    columns={'country_orig': 'country_name', 'country_orig_id': 'iso_code'}
)
countries_dest = df[['country_dest', 'country_dest_id']].rename(
    columns={'country_dest': 'country_name', 'country_dest_id': 'iso_code'}
)

unique_countries = pd.concat([countries_orig, countries_dest]).drop_duplicates().dropna().reset_index(drop=True)
# Assign a unique country_id
unique_countries.insert(0, 'country_id', range(1, len(unique_countries) + 1))

# Now, map countries to their regions
# A country's region is determined by its associated region column (region_orig or region_dest)
country_region_orig_map = df[['country_orig_id', 'region_orig']].rename(
    columns={'country_orig_id': 'iso_code', 'region_orig': 'region_name'}
)
country_region_dest_map = df[['country_dest_id', 'region_dest']].rename(
    columns={'country_dest_id': 'iso_code', 'region_dest': 'region_name'}
)

# Combine and get unique (iso_code, region_name) pairs
# This map shows which region an ISO code has been associated with.
country_to_region_name_map = pd.concat([country_region_orig_map, country_region_dest_map]).drop_duplicates().dropna()

# In case a country (iso_code) is ambiguously mapped to multiple regions in the data,
# we'll pick the first one encountered. Ideally, data is consistent.
country_to_region_name_map = country_to_region_name_map.drop_duplicates(subset=['iso_code'], keep='first')

# Add region_id to this country-to-region mapping
country_to_region_name_map['region_id'] = country_to_region_name_map['region_name'].map(region_name_to_id_map)

# Merge this region_id into the unique_countries table
countries = unique_countries.merge(
    country_to_region_name_map[['iso_code', 'region_id']],
    on='iso_code',
    how='left'
)
# Select and order columns for countries.csv: country_id, country_name, iso_code, region_id
countries = countries[['country_id', 'country_name', 'iso_code', 'region_id']]

# --- 3. Create Region Flows Table (region_flows.csv) ---
region_flows = df[['region_orig', 'region_dest', 
                   'regionflow_1990', 'regionflow_1995', 
                   'regionflow_2000', 'regionflow_2005']].copy() # Use .copy() to avoid SettingWithCopyWarning

region_flows.rename(columns={
    'region_orig': 'from_region_name',
    'region_dest': 'to_region_name',
    'regionflow_1990': 'flow_1990',
    'regionflow_1995': 'flow_1995',
    'regionflow_2000': 'flow_2000',
    'regionflow_2005': 'flow_2005'
}, inplace=True)

region_flows['from_region_id'] = region_flows['from_region_name'].map(region_name_to_id_map)
region_flows['to_region_id'] = region_flows['to_region_name'].map(region_name_to_id_map)

region_flows_output = region_flows[['from_region_id', 'to_region_id', 
                                 'flow_1990', 'flow_1995', 
                                 'flow_2000', 'flow_2005']]
region_flows_output = region_flows_output.drop_duplicates().reset_index(drop=True)

# --- 4. Create Country Flows Table (country_flows.csv) ---
# Create a map from iso_code to country_id from the 'countries' table
iso_to_country_id_map = dict(zip(countries['iso_code'], countries['country_id']))

country_flows = df[['country_orig_id', 'country_dest_id',
                    'countryflow_1990', 'countryflow_1995',
                    'countryflow_2000', 'countryflow_2005']].copy() # Use .copy()

country_flows.rename(columns={
    'country_orig_id': 'from_iso',
    'country_dest_id': 'to_iso',
    'countryflow_1990': 'flow_1990',
    'countryflow_1995': 'flow_1995',
    'countryflow_2000': 'flow_2000',
    'countryflow_2005': 'flow_2005'
}, inplace=True)

country_flows['from_country_id'] = country_flows['from_iso'].map(iso_to_country_id_map)
country_flows['to_country_id'] = country_flows['to_iso'].map(iso_to_country_id_map)

country_flows_output = country_flows[['from_country_id', 'to_country_id',
                                   'flow_1990', 'flow_1995',
                                   'flow_2000', 'flow_2005']]
# Drop rows where mapping to country_id might have failed (resulting in NaN)
country_flows_output = country_flows_output.dropna(subset=['from_country_id', 'to_country_id'])
# Convert IDs to integers
country_flows_output = country_flows_output.astype({
    'from_country_id': int, 
    'to_country_id': int
})
country_flows_output = country_flows_output.drop_duplicates().reset_index(drop=True)


# --- Save all CSVs ---
# Ensure 'data' directory exists for output, if not, create it
import os
output_dir = "data"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

regions.to_csv(os.path.join(output_dir, "regions.csv"), index=False)
countries.to_csv(os.path.join(output_dir, "countries.csv"), index=False)
region_flows_output.to_csv(os.path.join(output_dir, "region_flows.csv"), index=False)
country_flows_output.to_csv(os.path.join(output_dir, "country_flows.csv"), index=False)

print(f"'{output_dir}/regions.csv', '{output_dir}/countries.csv', '{output_dir}/region_flows.csv', and '{output_dir}/country_flows.csv' created successfully.")

# Optional: Print a sample of the countries DataFrame to verify
print("\nSample of data/countries.csv:")
print(countries.head())
print(f"\nTotal unique countries: {len(countries)}")
print(f"Number of countries with missing region_id: {countries['region_id'].isnull().sum()}")

print("\nSample of data/region_flows.csv:")
print(region_flows_output.head())

print("\nSample of data/country_flows.csv:")
print(country_flows_output.head())
