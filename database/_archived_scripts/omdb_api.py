import os
import sys
import requests
import re
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from db_helper import DB, conn_open, norm_space, norm_title, strip_dir_prefix, fetch_all_films, upsert_person, upsert_film_person

# Load environment variables from .env in database directory
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / '.env'

if not ENV_PATH.exists():
    print(f"Error: Configuration file not found: {ENV_PATH}", file=sys.stderr)
    print("Please ensure .env file exists with OMDB_API_KEY setting.", file=sys.stderr)
    sys.exit(1)

load_dotenv(ENV_PATH)

# Get API configuration from environment
OMDB_API_KEY = os.getenv('OMDB_API_KEY')
if not OMDB_API_KEY:
    print("Error: OMDB_API_KEY not found in .env file", file=sys.stderr)
    sys.exit(1)

OMDB_URL = "https://www.omdbapi.com/"


def fetch_omdb_data(film):
    # Prefer IMDb ID (exact), fallback to title/year
    if film.get("imdb_id"):
        params = {"apikey": OMDB_API_KEY, "i": film["imdb_id"]}
    else:
        params = {"apikey": OMDB_API_KEY, "t": film["title"]}
        if film.get("year"):
            params["y"] = film["year"]

    try:
        resp = requests.get(OMDB_URL, params=params, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        print(f"[OMDb] HTTP {resp.status_code}: {resp.text}")
        return None
    except requests.RequestException as e:
        print(f"[OMDb] request failed: {e}")
        return None


def parse_rt_percent(omdb: Dict[str, Any]) -> Optional[int]:
    for r in omdb.get("Ratings", []) or []:
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


def update_film_omdb_fields(conn, film_id, omdb_data):
    rt_pct = parse_rt_percent(omdb_data)
    imdb_rating = parse_imdb_rating(omdb_data)
    imdb_votes = parse_imdb_votes(omdb_data)
    plot = (omdb_data.get('Plot') or None)  # ← write to description

    with conn.cursor() as cursor:
        sql = '''
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
        '''
        cursor.execute(sql, (
            (omdb_data.get('Rated') or None),
            (omdb_data.get('Genre') or None),
            (omdb_data.get('Language') or None),
            (omdb_data.get('Country') or None),
            (omdb_data.get('Awards') or None),
            rt_pct,
            imdb_rating,
            imdb_votes,
            plot,
            film_id
        ))


def main():
    conn = conn_open()
    try:
        films = fetch_all_films(conn)
        found, not_found = 0, 0

        for film in films:
            omdb_data = fetch_omdb_data(film)
            if not omdb_data or omdb_data.get("Response") == "False":
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

            # Handle persons (director, writer, cast)
            for role in ["Director", "Writer", "Actors"]:
                names = (omdb_data.get(role) or "").split(",")
                for name in (n.strip() for n in names):
                    if not name:
                        continue
                    person_id = upsert_person(conn, name)
                    upsert_film_person(
                        conn, film["id"], person_id, role.lower() if role != "Actors" else "cast")

        conn.commit()
        print(f"\nDone. OMDb updated: {found}  |  Not found: {not_found}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
