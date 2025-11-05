#!/usr/bin/env python3
"""
Enrich person records with TMDB and IMDB IDs.

This script:
1. Finds all persons without external IDs
2. Searches TMDB API for each person
3. Updates the database with found IDs

Usage:
    python scripts/enrich_person_ids.py

Environment:
    Requires TMDB_API_KEY in .env file
"""

import os
import sys
import time
import requests
from pathlib import Path
from typing import Optional, Dict
from dotenv import load_dotenv
from db_helper import conn_open

# Load environment
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / '.env'

if not ENV_PATH.exists():
    print(f"Error: Configuration file not found: {ENV_PATH}", file=sys.stderr)
    print("Please ensure .env file exists with TMDB_API_KEY setting.", file=sys.stderr)
    sys.exit(1)

load_dotenv(ENV_PATH)

TMDB_API_KEY = os.getenv('TMDB_API_KEY')
if not TMDB_API_KEY:
    print("Error: TMDB_API_KEY not found in .env file", file=sys.stderr)
    sys.exit(1)

TMDB_BASE = "https://api.themoviedb.org/3"


# ============ API Functions ============

def search_tmdb_person(name: str) -> Optional[Dict]:
    """
    Search for a person on TMDB by name.
    Returns the first (most popular) result or None.
    """
    params = {
        "api_key": TMDB_API_KEY,
        "query": name,
    }

    try:
        resp = requests.get(f"{TMDB_BASE}/search/person",
                            params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            return results[0] if results else None
        print(f"TMDB API error {resp.status_code}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"TMDB person search failed for '{name}': {e}", file=sys.stderr)
        return None


def get_person_imdb_id_from_tmdb(tmdb_person_id: int) -> Optional[str]:
    """Get IMDB ID from TMDB person's external IDs."""
    params = {"api_key": TMDB_API_KEY}

    try:
        resp = requests.get(
            f"{TMDB_BASE}/person/{tmdb_person_id}/external_ids",
            params=params,
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("imdb_id")
        return None
    except Exception as e:
        print(
            f"Failed to get IMDB ID for TMDB person {tmdb_person_id}: {e}", file=sys.stderr)
        return None


def enrich_person_ids(name: str) -> Dict[str, Optional[str]]:
    """
    Get TMDB and IMDB IDs for a person by searching TMDB.

    Returns: {"tmdb_id": "123", "imdb_id": "nm0000001"} or {"tmdb_id": None, "imdb_id": None}
    """
    result = {"tmdb_id": None, "imdb_id": None}

    # Search TMDB for this person
    person = search_tmdb_person(name)
    if not person:
        return result

    # Get TMDB ID
    tmdb_id = person.get("id")
    if tmdb_id:
        result["tmdb_id"] = str(tmdb_id)

        # Get IMDB ID from TMDB
        time.sleep(0.3)  # Rate limiting
        imdb_id = get_person_imdb_id_from_tmdb(tmdb_id)
        if imdb_id:
            result["imdb_id"] = imdb_id

    return result


# ============ Main Script ============

def main():
    conn = conn_open()

    try:
        # Get all persons without external IDs
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, name 
                FROM person 
                WHERE (imdb_id IS NULL OR imdb_id = '') 
                  AND (tmdb_id IS NULL OR tmdb_id = '')
                ORDER BY id
            """)
            persons = cursor.fetchall()

        print(f"Found {len(persons)} persons without external IDs\n")

        updated = 0
        not_found = 0

        for person_id, name in persons:
            print(f"Searching for: {name} (ID: {person_id})")

            # Search TMDB
            ids = enrich_person_ids(name)

            if ids.get("tmdb_id") or ids.get("imdb_id"):
                # Update database
                with conn.cursor() as cursor:
                    cursor.execute(
                        "UPDATE person SET imdb_id=%s, tmdb_id=%s WHERE id=%s",
                        (ids.get("imdb_id"), ids.get("tmdb_id"), person_id)
                    )

                print(
                    f"  ✅ TMDB: {ids.get('tmdb_id')}, IMDB: {ids.get('imdb_id')}\n")
                updated += 1
            else:
                print(f"  ❌ Not found\n")
                not_found += 1

            # Rate limiting
            time.sleep(0.5)

        conn.commit()
        print(f"\n{'='*50}")
        print(f"Done!")
        print(f"  Updated: {updated}")
        print(f"  Not found: {not_found}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
