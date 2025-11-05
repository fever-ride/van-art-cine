import os
import re
import sys
from pathlib import Path
import pymysql
from dotenv import load_dotenv
from typing import Optional

# Find and load .env file from database directory
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / '.env'

if not ENV_PATH.exists():
    print(
        f"Error: Database configuration file not found: {ENV_PATH}", file=sys.stderr)
    print("Please ensure .env file exists with DB_* configuration.", file=sys.stderr)
    sys.exit(1)

# Load environment variables from .env
load_dotenv(ENV_PATH)

# Get database configuration from environment
DB = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': int(os.getenv('DB_PORT', '3306')),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASS'),
    'database': os.getenv('DB_NAME'),
    'charset': 'utf8mb4',
    'autocommit': True,
}

# Validate required settings
required = ['user', 'password', 'database']
missing = [key for key in required if not DB.get(key)]
if missing:
    print(
        f"Error: Missing required database settings: {', '.join(missing)}", file=sys.stderr)
    print(f"Please check {ENV_PATH} configuration.", file=sys.stderr)
    sys.exit(1)


def conn_open():
    """Open a new database connection using environment configuration.

    Returns:
        pymysql.Connection: Database connection object

    Raises:
        pymysql.Error: If connection fails
    """
    try:
        return pymysql.connect(**DB)
    except pymysql.Error as e:
        print(f"Error: Failed to connect to database: {e}", file=sys.stderr)
        print(
            f"Please verify database settings in {ENV_PATH}", file=sys.stderr)
        raise


def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def norm_title(t: str | None) -> str:
    if not t:
        return ""
    t = t.replace("’", "'")
    return norm_space(t).lower()


def strip_dir_prefix(name: str | None) -> str | None:
    if not name:
        return None
    return re.sub(r"^\s*dir\.?\s*", "", name, flags=re.I)


def remove_parentheses(text: str) -> str:
    """
    Examples:
    - "dirty money (4k restoration)" -> "dirty money"
    - "The Movie (2023 (Director's Cut))" -> "The Movie"
    - "Unclosed paren (something" -> "Unclosed paren"
    - "Normal title" -> "Normal title"
    """
    result = text
    while True:
        new_result = re.sub(r'\([^()]*\)', '', result)
        if new_result == result:
            # Remove any unclosed parenthesis and following text
            new_result = re.sub(r'\([^)]*$', '', result)
            return norm_space(new_result)
        result = new_result


def normalize_person_name(name: str) -> str:
    """
    Normalize person name for deduplication.

    Strategy:
    - Preserve middle names/initials
    - Standardize format (remove periods from initials)
    - Handle "Last, First" format
    - Lowercase everything

    Examples:
        "Kim A. Snyder" → "kim a snyder"
        "Kim A Snyder" → "kim a snyder"
        "Kurosawa, Akira" → "akira kurosawa"
        "George W. Bush" → "george w bush"
        "George H. W. Bush" → "george h w bush"
    """
    if not name or not name.strip():
        return ""

    # Replace special quotes
    name = name.replace("'", "'").replace("'", "'")

    # Normalize spaces
    name = norm_space(name).strip()

    # Handle "Last, First" format → "First Last"
    if ',' in name:
        parts = [p.strip() for p in name.split(',', 1)]
        if len(parts) == 2:
            name = f"{parts[1]} {parts[0]}"

    # Remove periods (mainly from middle initials)
    # "Kim A. Snyder" → "Kim A Snyder"
    name = name.replace('.', '')

    # Normalize spaces again (in case removing periods created double spaces)
    name = norm_space(name)

    # Lowercase
    return name.lower()


def upsert_person(conn, name, imdb_id=None, tmdb_id=None):
    """
    Find or create a person record.
    Uses external IDs (imdb_id, tmdb_id) for deduplication first,
    then falls back to normalized_name.

    Args:
        conn: Database connection
        name: Person's name
        imdb_id: Optional IMDB ID (e.g., "nm0000001")
        tmdb_id: Optional TMDB ID (integer as string)

    Returns:
        person_id (int)
    """
    if not name or not name.strip():
        raise ValueError("Person name cannot be empty")

    with conn.cursor() as cursor:
        # 1. Try to find by IMDB ID (most reliable)
        if imdb_id:
            cursor.execute(
                "SELECT id FROM person WHERE imdb_id = %s", (imdb_id,))
            result = cursor.fetchone()
            if result:
                return result[0]

        # 2. Try to find by TMDB ID
        if tmdb_id:
            cursor.execute(
                "SELECT id FROM person WHERE tmdb_id = %s", (tmdb_id,))
            result = cursor.fetchone()
            if result:
                return result[0]

        # 3. Try to find by normalized_name
        norm_name = normalize_person_name(name)
        if not norm_name:
            raise ValueError(f"Cannot normalize person name: '{name}'")

        cursor.execute(
            "SELECT id FROM person WHERE normalized_name = %s", (norm_name,))
        result = cursor.fetchone()
        if result:
            return result[0]

        # 4. Insert new person
        cursor.execute(
            "INSERT INTO person (name, imdb_id, tmdb_id, normalized_name) VALUES (%s, %s, %s, %s)",
            (name, imdb_id, tmdb_id, norm_name)
        )
        return cursor.lastrowid


def upsert_film_person(conn, film_id, person_id, role):
    """Link a person to a film with a specific role."""
    with conn.cursor() as cursor:
        cursor.execute(
            "REPLACE INTO film_person (film_id, person_id, role) VALUES (%s, %s, %s)",
            (film_id, person_id, role)
        )


def fetch_all_films(conn):
    """Fetch all films for enrichment scripts."""
    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("SELECT id, title, year, imdb_id, tmdb_id FROM film")
        return cursor.fetchall()
