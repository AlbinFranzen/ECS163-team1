import sqlite3
import re

# --- Configuration ---
DB_NAME = "migration_data.sqlite"
INPUT_FILE = "explanations.txt"

def create_connection(db_file):
    """ Create a database connection to the SQLite database specified by db_file """
    conn = None
    try:
        conn = sqlite3.connect(db_file)
        print(f"SQLite version: {sqlite3.sqlite_version}")
        print(f"Connected to {db_file}")
    except sqlite3.Error as e:
        print(e)
    return conn

def create_table(conn):
    """ Create the country_explanations table """
    sql_create_table = """
    CREATE TABLE IF NOT EXISTS country_explanations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        country_name TEXT NOT NULL UNIQUE,
        explanation TEXT NOT NULL,
        source_url TEXT,
        source_notes TEXT
    );
    """
    try:
        cursor = conn.cursor()
        cursor.execute(sql_create_table)
        conn.commit()
        print("Table 'country_explanations' ensured.")
    except sqlite3.Error as e:
        print(f"Error creating table: {e}")

def parse_source_line(line):
    """ Parses the source line to extract URL and notes. """
    url = None
    notes = None
    
    # Remove "Source: " prefix
    if line.startswith("Source: "):
        content = line[len("Source: "):].strip()
    else:
        content = line.strip() # Should not happen if format is consistent

    # Regex to find URL and optional parenthesized notes at the end
    # It tries to match a URL first, then optionally looks for (notes)
    match = re.match(r"^(https?://[^\s]+)\s*(?:\((.*)\))?$", content)
    if match:
        url = match.group(1)
        if match.group(2): # If notes part was captured
            notes = match.group(2).strip()
    else:
        # Fallback if regex doesn't match, assume the whole line is URL if it looks like one
        if content.startswith("http"):
            url = content
        print(f"Warning: Could not fully parse source line: '{line.strip()}'")

    return url, notes


def parse_explanations_file(filepath):
    """
    Parses the explanations.txt file and returns a list of dictionaries.
    Each dictionary represents a country's data.
    """
    countries_data = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File '{filepath}' not found.")
        return []

    # Split entries by double newline (or more)
    entries = re.split(r'\n\s*\n+', content.strip())

    for entry in entries:
        if not entry.strip():
            continue

        lines = entry.strip().split('\n')
        if len(lines) < 2:
            print(f"Warning: Skipping malformed entry (too few lines): {entry[:50]}...")
            continue

        country_name = lines[0].strip()
        
        # The last line is source, everything in between is explanation
        source_line_raw = lines[-1].strip()
        explanation_lines = lines[1:-1]
        explanation = "\n".join(line.strip() for line in explanation_lines).strip()

        source_url, source_notes = parse_source_line(source_line_raw)

        countries_data.append({
            "country_name": country_name,
            "explanation": explanation,
            "source_url": source_url,
            "source_notes": source_notes
        })
        # print(f"Parsed: {country_name}, URL: {source_url}, Notes: {source_notes}") # For debugging

    return countries_data

def insert_country_data(conn, country_data):
    """ Insert a new country record into the country_explanations table """
    sql_insert = '''
    INSERT INTO country_explanations (country_name, explanation, source_url, source_notes)
    VALUES (?, ?, ?, ?)
    '''
    try:
        cursor = conn.cursor()
        cursor.execute(sql_insert, (
            country_data['country_name'],
            country_data['explanation'],
            country_data['source_url'],
            country_data['source_notes']
        ))
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        print(f"Record for {country_data['country_name']} already exists or other integrity error.")
        return None
    except sqlite3.Error as e:
        print(f"Error inserting data for {country_data.get('country_name', 'Unknown')}: {e}")
        return None

def main():
    # 1. Create a database connection
    conn = create_connection(DB_NAME)

    if conn is not None:
        # 2. Create table
        create_table(conn)

        # 3. Parse the input file
        print(f"\nParsing '{INPUT_FILE}'...")
        all_data = parse_explanations_file(INPUT_FILE)

        if not all_data:
            print("No data parsed from the file. Exiting.")
            conn.close()
            return

        # 4. Insert data into the table
        print(f"\nInserting {len(all_data)} records into the database...")
        inserted_count = 0
        for data_item in all_data:
            row_id = insert_country_data(conn, data_item)
            if row_id:
                inserted_count +=1
                # print(f"Inserted {data_item['country_name']} with ID: {row_id}")
        print(f"Successfully inserted {inserted_count} new records.")
        
        # Optional: Verify by fetching a few records
        print("\nFetching first 3 records as verification:")
        cursor = conn.cursor()
        cursor.execute("SELECT country_name, source_url FROM country_explanations LIMIT 3")
        rows = cursor.fetchall()
        for row in rows:
            print(row)

        # 5. Close the connection
        conn.close()
        print(f"\nProcessing complete. Database '{DB_NAME}' updated.")
    else:
        print("Error! Cannot create the database connection.")

if __name__ == '__main__':
    # --- Create a dummy explanations.txt for testing if it doesn't exist ---
    try:
        with open(INPUT_FILE, 'r') as f:
            pass # File exists
    except FileNotFoundError:
        print(f"'{INPUT_FILE}' not found. Creating a dummy file for demonstration.")
        dummy_content = """Afghanistan
Ongoing conflicts, civil war, and Taliban rule were primary emigration drivers, leading to mass refugee flows, mainly to Pakistan and Iran. Immigration was largely limited to returning refugees during calmer periods and international personnel. Post-2001 intervention triggered new displacements and some repatriations.
Source: https://publications.iom.int/system/files/pdf/afghanistan_migration_profile_2010.pdf (See "Historical migration trends" section for context)

Albania
The collapse of communism triggered mass emigration due to severe economic crisis and political instability, primarily to Italy and Greece. Immigration remained minimal, with some transit migration. The period saw a shift from chaotic exodus to more regular, though often undocumented, labor migration.
Source: https://www.iom.int/sites/g/files/tmzbdl486/files/jahia/webdav/shared/shared/mainsite/policy_and_research/migration_albania_country_profile_2008.pdf

Algeria
Economic hardship, high unemployment, and civil conflict (1990s) drove emigration, primarily to France and other European countries. Immigration was limited, mainly some sub-Saharan African migrants in transit or seeking work. The end of intense conflict saw some reduction in asylum-driven departures.
Source: https://www.migrationpolicy.org/article/algeria-migration-crossroads (Provides historical context covering the period)
"""
        with open(INPUT_FILE, 'w', encoding='utf-8') as f:
            f.write(dummy_content)
    # --- End dummy file creation ---
    
    main()
