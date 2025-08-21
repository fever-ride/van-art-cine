import os
import json
import time
import random
import sys
import re
from typing import Optional, Dict, Any, List
import requests
import pymysql
from db_helper import DB, conn_open, norm_title, remove_parentheses

# ---------- Config ----------
TMDB_API_KEY = "a9662f05cd1a209fef971e00ef7d6369"
TMDB_BASE = "https://api.themoviedb.org/3"
CACHE_PATH = os.path.join("data", "tmdb_cache.json")
os.makedirs("data", exist_ok=True)

try:
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        CACHE = json.load(f)
except Exception:
    CACHE = {}

def save_cache():
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(CACHE, f, ensure_ascii=False, indent=2)

# Randomized delay between API requests
def backoff_sleep():
    time.sleep(random.uniform(0.35, 0.75))

def tmdb_get(path: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    url = f"{TMDB_BASE}/{path}"
    params["api_key"] = TMDB_API_KEY
    try:
        resp = requests.get(url, params=params)
        if resp.status_code == 200:
            return resp.json()
        print(f"TMDB API error {resp.status_code}: {resp.text}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"TMDB API request failed: {e}", file=sys.stderr)
        return None

def search_tmdb_movies(query: str, year: Optional[int]) -> List[Dict[str, Any]]:
    params = {"query": query, "include_adult": True}
    if year is not None:
        params["year"] = year
    data = tmdb_get("search/movie", params)
    backoff_sleep()
    return data.get("results", []) if data else []

def extract_year(item: Dict[str, Any]) -> Optional[int]:
    rd = item.get("release_date")
    if not rd:
        return None
    try:
        return int(rd[:4])
    except (ValueError, TypeError):
        return None

def pick_result(results: List[Dict[str, Any]], year: Optional[int]) -> Optional[Dict[str, Any]]:
    if not results:
        return None
    if year is not None:
        for it in results:
            if extract_year(it) == year:
                return it
    # fallback to first (TMDB ranking)
    return results[0]

def find_tmdb_and_imdb(title: str, year: Optional[int]) -> Optional[Dict[str, Optional[str]]]:
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
        out = {"tmdb_id": None, "imdb_id": None}
        CACHE[key] = out
        save_cache()
        return out

    tmdb_id = chosen.get("id")
    details = tmdb_get(f"movie/{tmdb_id}", {}) if tmdb_id is not None else None
    backoff_sleep()
    imdb_id = details.get("imdb_id") if details else None

    out = {"tmdb_id": str(tmdb_id) if tmdb_id is not None else None, "imdb_id": imdb_id}
    CACHE[key] = out
    save_cache()
    return out

def update_film_ids(conn, film_id: int, imdb_id: Optional[str], tmdb_id: Optional[str]):
    imdb_url = make_imdb_url(imdb_id)
    with conn.cursor() as cursor:
        cursor.execute(
            "UPDATE film SET imdb_id=%s, tmdb_id=%s, imdb_url=%s WHERE id=%s",
            (imdb_id, tmdb_id, imdb_url, film_id)
        )

def make_imdb_url(imdb_id: Optional[str]) -> Optional[str]:
    if not imdb_id:
        return None
    imdb_id = imdb_id.strip()
    # basic sanity: tt + 7+ digits
    if not re.match(r"^tt\d{7,}$", imdb_id):
        return None
    return f"https://www.imdb.com/title/{imdb_id}/"

def backfill_imdb_urls(conn) -> int:
    # fill imdb_url wherever imdb_id exists but imdb_url is missing/empty
    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("""
            SELECT id, imdb_id
            FROM film
            WHERE imdb_id IS NOT NULL
              AND imdb_id <> ''
              AND (imdb_url IS NULL OR imdb_url = '')
        """)
        rows = cursor.fetchall()

    updated = 0
    with conn.cursor() as cursor:
        for row in rows:
            url = make_imdb_url(row["imdb_id"])
            if url:
                cursor.execute("UPDATE film SET imdb_url=%s WHERE id=%s", (url, row["id"]))
                updated += 1
    return updated

def main():
    conn = conn_open()
    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("SELECT id, title, year, imdb_id, tmdb_id FROM film")
        films = cursor.fetchall()

    updated, not_found = 0, 0

    for film in films:
        # If already has both IDs, at least ensure imdb_url exists
        if film["imdb_id"] and film["tmdb_id"]:
            # quick fill for imdb_url in already-complete records
            with conn.cursor() as cursor:
                url = make_imdb_url(film["imdb_id"])
                if url:
                    cursor.execute(
                        "UPDATE film SET imdb_url=COALESCE(imdb_url, %s) WHERE id=%s",
                        (url, film["id"])
                    )
            continue

        ids = find_tmdb_and_imdb(film["title"], film["year"])
        if ids and (ids["imdb_id"] or ids["tmdb_id"]):
            update_film_ids(conn, film["id"], ids["imdb_id"], ids["tmdb_id"])
            print(f"Updated: {film['title']} ({film['year']}) → IMDb: {ids['imdb_id']}, TMDB: {ids['tmdb_id']}")
            updated += 1
        else:
            print(f"Not found: {film['title']} ({film['year']})")
            not_found += 1

    # Final pass to fill any remaining imdb_url gaps
    filled = backfill_imdb_urls(conn)

    print(f"Done. Updated IDs {updated}, Not found: {not_found}, IMDb URLs filled: {filled}")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()