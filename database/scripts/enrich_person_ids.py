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

import psycopg2
import requests
from dotenv import load_dotenv

from db_helper import conn_open, reconnect
from http_retry import get_with_retry
from log_setup import get_logger

log = get_logger("enrich_person_ids")

# ---------- Environment ----------
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / ".env"

if not ENV_PATH.exists():
    log.error(f"Configuration file not found: {ENV_PATH}")
    log.error("Please ensure .env exists with TMDB_API_KEY and DATABASE_URL.")
    sys.exit(1)

load_dotenv(ENV_PATH)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
if not TMDB_API_KEY:
    log.error("TMDB_API_KEY not found in .env")
    sys.exit(1)

TMDB_BASE = "https://api.themoviedb.org/3"

# Use a single session for connection reuse + timeouts
HTTP = requests.Session()
HTTP.headers.update({"Accept": "application/json"})

_TMDB_HTTP_STATS = {
    "http_429": 0,
    "http_4xx": 0,
    "http_5xx": 0,
    "request_exc": 0,
}


def _reset_tmdb_http_stats() -> None:
    for k in _TMDB_HTTP_STATS:
        _TMDB_HTTP_STATS[k] = 0


# ---------- TMDB helpers ----------
def _tmdb_get(path: str, params: Dict) -> Optional[Dict]:
    """
    Call a TMDB API endpoint with retry/backoff on rate limiting (429),
    server errors (5xx), and transient network errors.
    """
    p = dict(params or {})
    p["api_key"] = TMDB_API_KEY
    r = get_with_retry(
        HTTP, f"{TMDB_BASE}/{path}", p, stats=_TMDB_HTTP_STATS, label="TMDB")
    if r is None:
        return None
    if r.status_code == 200:
        return r.json()
    log.warning(f"TMDB error {r.status_code} for {path}: {r.text[:200]}")
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
    _reset_tmdb_http_stats()
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

        log.info(f"Found {len(persons)} persons without external IDs")

        updated = 0
        not_found = 0
        reconnects = 0

        for person_id, name in persons:
            log.info(f"Searching: {name} (id={person_id})")

            # TMDB lookup happens before any DB write, so no transaction is
            # held open across it — the DB connection just sits idle while
            # we wait on the network, and commits are per-row below.
            ids = enrich_person_ids(name)

            for attempt in range(2):
                try:
                    if ids.get("tmdb_id") or ids.get("imdb_id"):
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE person SET imdb_id = %s, tmdb_id = %s WHERE id = %s",
                                (ids.get("imdb_id"), ids.get("tmdb_id"), person_id),
                            )
                        conn.commit()
                        log.info(
                            f"  Found — TMDB: {ids.get('tmdb_id')}, IMDb: {ids.get('imdb_id')}")
                        updated += 1
                    else:
                        log.info("  Not found")
                        not_found += 1
                    break
                except psycopg2.OperationalError as e:
                    log.warning(
                        f"DB connection lost while writing {name!r} ({e}); "
                        f"reconnecting..."
                    )
                    conn = reconnect(conn)
                    reconnects += 1
                    if attempt == 1:
                        log.error(f"Giving up on {name!r} after reconnect retry")

            # global throttle
            time.sleep(0.5)

        log.info(f"Done. Updated: {updated}  |  Not found: {not_found}")
        if reconnects:
            log.info(f"DB reconnected {reconnects} time(s) mid-run")
        log.info(
            f"TMDB API summary — 429 rate limit: {_TMDB_HTTP_STATS['http_429']}  |  "
            f"4xx (other): {_TMDB_HTTP_STATS['http_4xx']}  |  "
            f"5xx: {_TMDB_HTTP_STATS['http_5xx']}  |  "
            f"request errors: {_TMDB_HTTP_STATS['request_exc']}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
