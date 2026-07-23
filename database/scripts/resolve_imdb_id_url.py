"""
Backfill TMDB/IMDb IDs, IMDb URLs, and poster paths for films (PostgreSQL version).

- Reads TMDB via API, caches results to data/tmdb_cache.json
- Updates film.imdb_id, film.tmdb_id, film.imdb_url, film.poster_path
- Safe to run multiple times (idempotent with cache)
"""

import os
import json
import time
import random
import sys
import re
from typing import Optional, Dict, Any, List
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

from db_helper import conn_open, norm_title, remove_parentheses, reconnect
from http_retry import get_with_retry
from log_setup import get_logger

log = get_logger("resolve_imdb_id_url")

# ---------- Config ----------
# Load environment variables from .env in database directory
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / ".env"

if not ENV_PATH.exists():
    log.error(f"Configuration file not found: {ENV_PATH}")
    log.error("Please ensure .env file exists with TMDB_API_KEY (and DATABASE_URL).")
    sys.exit(1)

load_dotenv(ENV_PATH)

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
if not TMDB_API_KEY:
    log.error("TMDB_API_KEY not found in .env file")
    sys.exit(1)

TMDB_BASE = "https://api.themoviedb.org/3"
HTTP = requests.Session()

# Determine project root directory (parent of database/)
PROJECT_ROOT = DB_DIR.parent

# Cache file
CACHE_PATH = os.path.join(PROJECT_ROOT, "data", "tmdb_cache.json")
os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)

try:
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        CACHE = json.load(f)
except Exception as e:
    log.warning(f"Could not load cache from {CACHE_PATH}: {e}")
    CACHE = {}


def save_cache():
    """Persist the in-memory TMDB lookup cache to disk as JSON."""
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(CACHE, f, ensure_ascii=False, indent=2)


# Randomized delay between API requests to be polite to TMDB
def backoff_sleep():
    time.sleep(random.uniform(0.35, 0.75))


# Incremented by tmdb_get; reset at the start of main() for a clean per-run summary.
_TMDB_HTTP_STATS = {
    "http_429": 0,
    "http_4xx": 0,
    "http_5xx": 0,
    "request_exc": 0,
}


def _reset_tmdb_http_stats() -> None:
    for k in _TMDB_HTTP_STATS:
        _TMDB_HTTP_STATS[k] = 0


def tmdb_get(path: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Call a TMDB API endpoint with the shared API key.
    Retries on rate limiting (429), server errors (5xx), and transient
    network errors before giving up.
    Returns the parsed JSON response on HTTP 200, or None on any error/non-200 status.
    """
    url = f"{TMDB_BASE}/{path}"
    params = dict(params or {})
    params["api_key"] = TMDB_API_KEY
    resp = get_with_retry(
        HTTP, url, params, stats=_TMDB_HTTP_STATS, label="TMDB")
    if resp is None:
        return None
    if resp.status_code == 200:
        return resp.json()
    log.warning(f"TMDB API error {resp.status_code}: {resp.text}")
    return None


def search_tmdb_movies(query: str, year: Optional[int]) -> List[Dict[str, Any]]:
    """
    Search TMDB's movie catalog by title (and optional year) using /search/movie.
    Returns the raw 'results' list from TMDB, or an empty list if the call fails.
    """
    params = {"query": query, "include_adult": True}
    if year is not None:
        params["year"] = year
    data = tmdb_get("search/movie", params)
    backoff_sleep()
    return data.get("results", []) if data else []


def extract_year(item: Dict[str, Any]) -> Optional[int]:
    """
    Extract the release year (YYYY) from a TMDB movie result's 'release_date' field.
    Returns an int year or None if the date is missing or malformed.
    """
    rd = item.get("release_date")
    if not rd:
        return None
    try:
        return int(rd[:4])
    except (ValueError, TypeError):
        return None


def pick_result(results: List[Dict[str, Any]], year: Optional[int]) -> Optional[Dict[str, Any]]:
    """
    Choose the best TMDB search result for a film.
    If a target year is provided, prefer the first result whose release year matches.
    Otherwise, fall back to the first result in TMDB's ranked list.
    """
    if not results:
        return None
    if year is not None:
        for it in results:
            if extract_year(it) == year:
                return it
    # fallback to first (TMDB ranking)
    return results[0]


def find_tmdb_and_imdb(title: str, year: Optional[int]) -> Optional[Dict[str, Optional[str]]]:
    """
    Resolve a film's TMDB ID, IMDb ID, and poster_path using the TMDB API with caching.
    Workflow:
    - Normalize (title, year) into a cache key; return the cached result if present.
    - Search TMDB by title (and year), retrying with parentheses removed on no results.
    - Pick the best candidate and fetch full details to obtain imdb_id.
    - Return and cache a dict: { 'tmdb_id', 'imdb_id', 'poster_path' }.
    """
    key = f"{norm_title(title)}|{year or ''}"
    if key in CACHE:
        return CACHE[key]

    # 1) primary search
    results = search_tmdb_movies(title, year)

    # 2) retry without parentheses if no results
    if not results:
        results = search_tmdb_movies(remove_parentheses(title), year)

    # 3) choose best candidate
    chosen = pick_result(results, year)
    if not chosen:
        out = {"tmdb_id": None, "imdb_id": None, "poster_path": None}
        CACHE[key] = out
        save_cache()
        return out

    tmdb_id = chosen.get("id")
    poster_path = chosen.get("poster_path")

    details = tmdb_get(f"movie/{tmdb_id}", {}) if tmdb_id is not None else None
    backoff_sleep()
    imdb_id = details.get("imdb_id") if details else None

    out = {
        "tmdb_id": str(tmdb_id) if tmdb_id is not None else None,
        "imdb_id": imdb_id,
        "poster_path": poster_path,
    }
    CACHE[key] = out
    save_cache()
    return out


def make_imdb_url(imdb_id: Optional[str]) -> Optional[str]:
    """
    Build a canonical IMDb title URL from an IMDb ID (e.g. 'tt1234567').
    Returns the URL string if the ID matches the 'tt' + digits pattern, otherwise None.
    """
    if not imdb_id:
        return None
    imdb_id = imdb_id.strip()
    # basic sanity: tt + 7+ digits
    if not re.match(r"^tt\d{7,}$", imdb_id):
        return None
    return f"https://www.imdb.com/title/{imdb_id}/"


def update_film_ids(
    conn,
    film_id: int,
    imdb_id: Optional[str],
    tmdb_id: Optional[str],
    poster_path: Optional[str],
):
    """
    Update a single film row with its IMDb/TMDB identifiers, IMDb URL, and TMDB poster_path.
    This is used after a successful TMDB lookup to persist external IDs and poster metadata.
    """
    imdb_url = make_imdb_url(imdb_id)
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE film
            SET imdb_id = %s,
                tmdb_id = %s,
                imdb_url = %s,
                poster_path = %s
            WHERE id = %s
            """,
            (imdb_id, tmdb_id, imdb_url, poster_path, film_id),
        )


def backfill_imdb_urls(conn) -> int:
    """
    Populate imdb_url for films that already have imdb_id but a missing/empty imdb_url.
    Returns the number of rows updated.
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """
            SELECT id, imdb_id
            FROM film
            WHERE imdb_id IS NOT NULL
              AND imdb_id <> ''
              AND (imdb_url IS NULL OR imdb_url = '')
            """
        )
        rows = cursor.fetchall()

    updated = 0
    with conn.cursor() as cursor:
        for row in rows:
            url = make_imdb_url(row["imdb_id"])
            if url:
                cursor.execute(
                    "UPDATE film SET imdb_url = %s WHERE id = %s", (url, row["id"]))
                updated += 1
    return updated


def main():
    _reset_tmdb_http_stats()
    conn = conn_open()
    try:
        # Read films as dictionaries
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, title, year, imdb_id, tmdb_id, poster_path FROM film"
            )
            films = cursor.fetchall()

        updated, not_found, reconnects = 0, 0, 0

        for film in films:
            # The slow, unpredictable part (TMDB lookup) happens BEFORE we touch
            # the DB, so no transaction is ever held open across it. If the
            # connection was dropped server-side while we were waiting on TMDB
            # (e.g. an idle-connection timeout on a pooled/serverless Postgres),
            # we reconnect once and retry this single row's write instead of
            # losing the whole run.
            ids = None
            if not (film["imdb_id"] and film["tmdb_id"] and film["poster_path"]):
                ids = find_tmdb_and_imdb(film["title"], film["year"])

            for attempt in range(2):
                try:
                    if ids is None:
                        # Already has both IDs and a poster; just ensure imdb_url exists.
                        with conn.cursor() as cursor:
                            url = make_imdb_url(film["imdb_id"])
                            if url:
                                cursor.execute(
                                    "UPDATE film SET imdb_url = COALESCE(imdb_url, %s) WHERE id = %s",
                                    (url, film["id"]),
                                )
                        conn.commit()
                    elif ids["imdb_id"] or ids["tmdb_id"]:
                        update_film_ids(
                            conn,
                            film["id"],
                            ids.get("imdb_id"),
                            ids.get("tmdb_id"),
                            ids.get("poster_path"),
                        )
                        conn.commit()
                        log.info(
                            f"Updated: {film['title']} ({film['year']}) "
                            f"→ IMDb: {ids.get('imdb_id')}, TMDB: {ids.get('tmdb_id')}, "
                            f"poster_path: {ids.get('poster_path')}"
                        )
                        updated += 1
                    else:
                        log.info(f"Not found: {film['title']} ({film['year']})")
                        not_found += 1
                    break  # row handled (written or intentionally skipped)
                except psycopg2.OperationalError as e:
                    log.warning(
                        f"DB connection lost while writing {film['title']!r} ({e}); "
                        f"reconnecting..."
                    )
                    conn = reconnect(conn)
                    reconnects += 1
                    # loop again for one retry attempt; on second failure we move on
                    if attempt == 1:
                        log.error(
                            f"Giving up on {film['title']!r} after reconnect retry")

        # Final pass to fill any remaining imdb_url gaps
        try:
            filled = backfill_imdb_urls(conn)
            conn.commit()
        except psycopg2.OperationalError as e:
            log.warning(
                f"DB connection lost during imdb_url backfill pass ({e}); "
                f"reconnecting and retrying once..."
            )
            conn = reconnect(conn)
            reconnects += 1
            filled = backfill_imdb_urls(conn)
            conn.commit()

        log.info(
            f"Done. Updated IDs: {updated}, Not found: {not_found}, IMDb URLs filled: {filled}")
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
