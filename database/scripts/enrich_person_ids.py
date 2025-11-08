#!/usr/bin/env python3
"""
Enrich person records with TMDB and IMDb IDs (PostgreSQL version).

This script:
1) Finds all persons without external IDs
2) Searches TMDB API for each person
3) Updates the database with found IDs

Usage:
    python scripts/enrich_person_ids.py

Environment:
    Requires TMDB_API_KEY in database/.env
    Requires DATABASE_URL in database/.env (used by db_helper.conn_open)
"""

import os
import sys
import time
from pathlib import Path
from typing import Optional, Dict

import requests
from dotenv import load_dotenv

from db_helper import conn_open

# ---------- Environment ----------
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / ".env"

if not ENV_PATH.exists():
    print(f"Error: Configuration file not found: {ENV_PATH}", file=sys.stderr)
    print("Please ensure .env exists with TMDB_API_KEY and DATABASE_URL.", file=sys.stderr)
    sys.exit(1)

load_dotenv(ENV_PATH)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
if not TMDB_API_KEY:
    print("Error: TMDB_API_KEY not found in .env", file=sys.stderr)
    sys.exit(1)

TMDB_BASE = "https://api.themoviedb.org/3"

# Use a single session for connection reuse + timeouts
HTTP = requests.Session()
HTTP.headers.update({"Accept": "application/json"})


# ---------- TMDB helpers ----------
def _tmdb_get(path: str, params: Dict) -> Optional[Dict]:
    p = dict(params or {})
    p["api_key"] = TMDB_API_KEY
    try:
        r = HTTP.get(f"{TMDB_BASE}/{path}", params=p, timeout=15)
        if r.status_code == 200:
            return r.json()
        # Log non-200 but keep going
        print(
            f"TMDB error {r.status_code} for {path}: {r.text[:200]}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"TMDB request failed for {path}: {e}", file=sys.stderr)
        return None


def search_tmdb_person(name: str) -> Optional[Dict]:
    """Return top TMDB search result for a person, or None."""
    data = _tmdb_get("search/person", {"query": name})
    time.sleep(0.3)  # be polite to the API
    if not data:
        return None
    results = data.get("results", [])
    return results[0] if results else None


def get_person_imdb_id_from_tmdb(tmdb_person_id: int) -> Optional[str]:
    data = _tmdb_get(f"person/{tmdb_person_id}/external_ids", {})
    time.sleep(0.3)
    if not data:
        return None
    return data.get("imdb_id")


def enrich_person_ids(name: str) -> Dict[str, Optional[str]]:
    """
    Get TMDB and IMDb IDs for a person by searching TMDB.

    Returns:
      {"tmdb_id": "123", "imdb_id": "nm0000001"}  (values can be None)
    """
    out = {"tmdb_id": None, "imdb_id": None}

    person = search_tmdb_person(name)
    if not person:
        return out

    tmdb_id = person.get("id")
    if tmdb_id:
        out["tmdb_id"] = str(tmdb_id)
        imdb_id = get_person_imdb_id_from_tmdb(tmdb_id)
        if imdb_id:
            out["imdb_id"] = imdb_id

    return out


# ---------- Main ----------
def main():
    conn = conn_open()
    try:
        # Fetch people without external IDs
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name
                FROM person
                WHERE (imdb_id IS NULL OR imdb_id = '')
                AND tmdb_id IS NULL
                ORDER BY id
            """)
            persons = cur.fetchall()

        print(f"Found {len(persons)} persons without external IDs\n")

        updated = 0
        not_found = 0

        for person_id, name in persons:
            print(f"Searching: {name} (id={person_id})")

            ids = enrich_person_ids(name)

            if ids.get("tmdb_id") or ids.get("imdb_id"):
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE person SET imdb_id = %s, tmdb_id = %s WHERE id = %s",
                        (ids.get("imdb_id"), ids.get("tmdb_id"), person_id),
                    )
                print(
                    f"  ✅ TMDB: {ids.get('tmdb_id')}, IMDb: {ids.get('imdb_id')}\n")
                updated += 1
            else:
                print("  ❌ Not found\n")
                not_found += 1

            # global throttle
            time.sleep(0.5)

        conn.commit()
        print("=" * 50)
        print("Done.")
        print(f"  Updated:   {updated}")
        print(f"  Not found: {not_found}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
