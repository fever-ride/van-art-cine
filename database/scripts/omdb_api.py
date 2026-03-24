#!/usr/bin/env python3
"""
Enrich film records with OMDb metadata (PostgreSQL version).

- Fetches OMDb data by IMDb ID when available, otherwise by title/year
- Updates film table fields (rated, genre, language, country, awards,
  rt_rating_pct, imdb_rating, imdb_votes, description)
- Inserts people (director/writer/cast) via upsert_person / upsert_film_person

Env:
  - OMDB_API_KEY in database/.env
  - DATABASE_URL in database/.env (used by db_helper.conn_open)
"""

import os
import sys
import re
from pathlib import Path
from typing import Optional, Dict, Any, MutableMapping

import requests
from dotenv import load_dotenv

from db_helper import (
    conn_open,
    fetch_all_films,
    upsert_person,
    upsert_film_person,
)

# ---------- Environment ----------
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / ".env"

if not ENV_PATH.exists():
    print(f"Error: Configuration file not found: {ENV_PATH}", file=sys.stderr)
    print("Please ensure .env file exists with OMDB_API_KEY and DATABASE_URL.", file=sys.stderr)
    sys.exit(1)

load_dotenv(ENV_PATH)

OMDB_API_KEY = os.getenv("OMDB_API_KEY")
if not OMDB_API_KEY:
    print("Error: OMDB_API_KEY not found in .env file", file=sys.stderr)
    sys.exit(1)

OMDB_URL = "https://www.omdbapi.com/"

HTTP = requests.Session()
HTTP.headers.update({"Accept": "application/json"})


# ---------- OMDb helpers ----------
def _bump_omdb_http_stats(stats: MutableMapping[str, int], status_code: int) -> None:
    if status_code == 429:
        stats["http_429"] += 1
    elif 400 <= status_code < 500:
        stats["http_4xx"] += 1
    elif status_code >= 500:
        stats["http_5xx"] += 1


def fetch_omdb_data(
    film: Dict[str, Any],
    stats: Optional[MutableMapping[str, int]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Prefer IMDb ID (exact), fallback to title/year.
    Returns parsed JSON or None.
    If `stats` is provided, increments HTTP / transport counters for the run summary.
    """
    if film.get("imdb_id"):
        params = {"apikey": OMDB_API_KEY, "i": film["imdb_id"]}
    else:
        params = {"apikey": OMDB_API_KEY, "t": film["title"]}
        if film.get("year"):
            params["y"] = film["year"]

    try:
        resp = HTTP.get(OMDB_URL, params=params, timeout=15)
        if resp.status_code == 200:
            return resp.json()
        if stats is not None:
            _bump_omdb_http_stats(stats, resp.status_code)
        print(
            f"[OMDb] HTTP {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
        return None
    except requests.RequestException as e:
        if stats is not None:
            stats["request_exc"] += 1
        print(f"[OMDb] request failed: {e}", file=sys.stderr)
        return None


def parse_rt_percent(omdb: Dict[str, Any]) -> Optional[int]:
    for r in (omdb.get("Ratings") or []):
        if r.get("Source") == "Rotten Tomatoes":
            m = re.match(r"^(\d{1,3})%$", (r.get("Value") or "").strip())
            if m:
                pct = int(m.group(1))
                return pct if 0 <= pct <= 100 else None
    return None


def parse_imdb_rating(omdb: Dict[str, Any]) -> Optional[float]:
    val = (omdb.get("imdbRating") or "").strip()
    if val and val != "N/A":
        try:
            x = float(val)
            return x if 0.0 <= x <= 10.0 else None
        except ValueError:
            return None
    return None


def parse_imdb_votes(omdb: Dict[str, Any]) -> Optional[int]:
    val = (omdb.get("imdbVotes") or "").replace(",", "").strip()
    if val and val != "N/A":
        try:
            n = int(val)
            return n if n >= 0 else None
        except ValueError:
            return None
    return None


def update_film_omdb_fields(conn, film_id: int, omdb_data: Dict[str, Any]) -> None:
    rt_pct = parse_rt_percent(omdb_data)
    imdb_rating = parse_imdb_rating(omdb_data)
    imdb_votes = parse_imdb_votes(omdb_data)
    plot = omdb_data.get("Plot") or None  # store as description

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE film SET
                rated = %s,
                genre = %s,
                language = %s,
                country = %s,
                awards = %s,
                rt_rating_pct = %s,
                imdb_rating = %s,
                imdb_votes = %s,
                description = %s
            WHERE id = %s
            """,
            (
                omdb_data.get("Rated") or None,
                omdb_data.get("Genre") or None,
                omdb_data.get("Language") or None,
                omdb_data.get("Country") or None,
                omdb_data.get("Awards") or None,
                rt_pct,
                imdb_rating,
                imdb_votes,
                plot,
                film_id,
            ),
        )


# ---------- Main ----------
def main():
    conn = conn_open()
    try:
        # returns list of dicts (id, title, year, imdb_id, tmdb_id)
        films = fetch_all_films(conn)
        found, not_found = 0, 0
        omdb_response_false = 0  # HTTP 200 but OMDb says no match
        omdb_stats = {
            "http_429": 0,
            "http_4xx": 0,
            "http_5xx": 0,
            "request_exc": 0,
        }

        for film in films:
            omdb_data = fetch_omdb_data(film, omdb_stats)
            if not omdb_data:
                print(
                    f"[MISS] {film['title']} ({film.get('year') or ''})  imdb_id={film.get('imdb_id') or '-'}")
                not_found += 1
                continue
            if omdb_data.get("Response") == "False":
                omdb_response_false += 1
                print(
                    f"[MISS] {film['title']} ({film.get('year') or ''})  imdb_id={film.get('imdb_id') or '-'}")
                not_found += 1
                continue

            update_film_omdb_fields(conn, film["id"], omdb_data)
            found += 1

            # brief success log with key fields
            rt = parse_rt_percent(omdb_data)
            ir = parse_imdb_rating(omdb_data)
            iv = parse_imdb_votes(omdb_data)
            print(
                f"[OK] {film['title']} ({film.get('year') or ''})  "
                f"imdb_id={film.get('imdb_id') or omdb_data.get('imdbID') or '-'}  "
                f"Rated={omdb_data.get('Rated') or '-'}  RT%={rt if rt is not None else '-'}  "
                f"IMDb={ir if ir is not None else '-'} ({iv if iv is not None else '-'})"
            )

            # people: Director / Writer / Actors
            for role in ["Director", "Writer", "Actors"]:
                names = (omdb_data.get(role) or "").split(",")
                for name in (n.strip() for n in names):
                    if not name:
                        continue
                    person_id = upsert_person(conn, name)
                    upsert_film_person(
                        conn,
                        film["id"],
                        person_id,
                        role.lower() if role != "Actors" else "cast",
                    )

        conn.commit()
        print(f"\nDone. OMDb updated: {found}  |  Rows without metadata: {not_found}")
        print("--- OMDb API summary ---")
        print(
            f"  HTTP 429: {omdb_stats['http_429']}  |  "
            f"4xx (other): {omdb_stats['http_4xx']}  |  "
            f"5xx: {omdb_stats['http_5xx']}  |  "
            f"request errors: {omdb_stats['request_exc']}"
        )
        print(
            f"  OMDb Response=False (no match in catalog): {omdb_response_false}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
