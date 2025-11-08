# db_helper.py — PostgreSQL version
import os
import re
import sys
from pathlib import Path
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# ---------- Load environment ----------
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / ".env"

if not ENV_PATH.exists():
    print(
        f"Error: Database configuration file not found: {ENV_PATH}", file=sys.stderr)
    sys.exit(1)

load_dotenv(ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: Missing DATABASE_URL in .env", file=sys.stderr)
    sys.exit(1)


# ---------- Connection ----------
def conn_open():
    """Open a new PostgreSQL connection using DATABASE_URL."""
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"Error: Failed to connect to Postgres: {e}", file=sys.stderr)
        raise


# ---------- Text normalization helpers ----------
def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def norm_title(t: Optional[str]) -> str:
    if not t:
        return ""
    t = t.replace("’", "'")
    return norm_space(t).lower()


def strip_dir_prefix(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    return re.sub(r"^\s*dir\.?\s*", "", name, flags=re.I)


def remove_parentheses(text: str) -> str:
    """Remove all parentheses and their contents."""
    result = text
    while True:
        new_result = re.sub(r"\([^()]*\)", "", result)
        if new_result == result:
            new_result = re.sub(r"\([^)]*$", "", result)
            return norm_space(new_result)
        result = new_result


def normalize_person_name(name: str) -> str:
    """Normalize person names for deduplication."""
    if not name or not name.strip():
        return ""

    name = norm_space(name).strip()
    if "," in name:
        parts = [p.strip() for p in name.split(",", 1)]
        if len(parts) == 2:
            name = f"{parts[1]} {parts[0]}"
    name = name.replace(".", "")
    name = norm_space(name)
    return name.lower()


# ---------- Database operations ----------
def upsert_person(conn, name, imdb_id=None, tmdb_id=None):
    """
    Find or create a person record.
    Uses PostgreSQL ON CONFLICT syntax.
    """
    if not name or not name.strip():
        raise ValueError("Person name cannot be empty")

    norm_name = normalize_person_name(name)
    if not norm_name:
        raise ValueError(f"Cannot normalize person name: '{name}'")

    with conn.cursor() as cursor:
        # 1. Lookup by external IDs
        if imdb_id:
            cursor.execute(
                "SELECT id FROM person WHERE imdb_id = %s", (imdb_id,))
            row = cursor.fetchone()
            if row:
                return row[0]

        if tmdb_id:
            cursor.execute(
                "SELECT id FROM person WHERE tmdb_id = %s", (tmdb_id,))
            row = cursor.fetchone()
            if row:
                return row[0]

        # 2. Lookup by normalized name
        cursor.execute(
            "SELECT id FROM person WHERE normalized_name = %s", (norm_name,))
        row = cursor.fetchone()
        if row:
            return row[0]

        # 3. Insert or update existing record
        cursor.execute(
            """
            INSERT INTO person (name, imdb_id, tmdb_id, normalized_name)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (normalized_name)
            DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            (name, imdb_id, tmdb_id, norm_name),
        )
        new_id = cursor.fetchone()[0]
        return new_id


def upsert_film_person(conn, film_id, person_id, role):
    """Link a person to a film with a specific role."""
    with conn.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO film_person (film_id, person_id, role)
            VALUES (%s, %s, %s)
            ON CONFLICT (film_id, person_id, role) DO NOTHING
            """,
            (film_id, person_id, role),
        )


def fetch_all_films(conn):
    """Fetch all films as a list of dictionaries."""
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT id, title, year, imdb_id, tmdb_id FROM film")
        return cursor.fetchall()
