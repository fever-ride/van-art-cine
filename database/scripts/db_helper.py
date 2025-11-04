import os
import re
import sys
from pathlib import Path
import pymysql
from dotenv import load_dotenv

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


def fetch_all_films(conn):
    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("SELECT * FROM film")
        return cursor.fetchall()


def upsert_person(conn, name, imdb_id=None, tmdb_id=None):
    norm_name = norm_space(name).lower()
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM person WHERE normalized_name = %s", (norm_name,))
        result = cursor.fetchone()
        if result:
            return result[0]
        cursor.execute(
            "INSERT INTO person (name, imdb_id, tmdb_id) VALUES (%s, %s, %s)",
            (name, imdb_id, tmdb_id)
        )
        return cursor.lastrowid


def upsert_film_person(conn, film_id, person_id, role):
    with conn.cursor() as cursor:
        cursor.execute(
            "REPLACE INTO film_person (film_id, person_id, role) VALUES (%s, %s, %s)",
            (film_id, person_id, role)
        )
