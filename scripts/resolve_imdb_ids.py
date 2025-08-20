import os
import json
import time
import random
import sys
import re
from typing import Optional, Dict, Any
import requests
import pymysql
from db_helper import DB, conn_open, norm_title

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

def find_tmdb_and_imdb(title: str, year: Optional[int]) -> Optional[Dict[str, Optional[str]]]:
    key = f"{norm_title(title)}|{year or ''}"
    if key in CACHE:
        return CACHE[key]

    params = {"query": title, "include_adult": False}
    if year:
        params["year"] = year

    data = tmdb_get("search/movie", params)
    backoff_sleep()
    if not data or not data.get("results"):
        result = {"tmdb_id": None, "imdb_id": None}
        CACHE[key] = result
        save_cache()
        return result

    for result in data["results"]:
        if norm_title(result.get("title")) == norm_title(title):
            tmdb_id = result["id"]
            details = tmdb_get(f"movie/{tmdb_id}", {})
            backoff_sleep()
            imdb_id = details.get("imdb_id") if details else None
            result = {"tmdb_id": str(tmdb_id), "imdb_id": imdb_id}
            CACHE[key] = result
            save_cache()
            return result

    # fallback to first result
    fallback = data["results"][0]
    tmdb_id = fallback["id"]
    details = tmdb_get(f"movie/{tmdb_id}", {})
    backoff_sleep()
    imdb_id = details.get("imdb_id") if details else None
    result = {"tmdb_id": str(tmdb_id), "imdb_id": imdb_id}
    CACHE[key] = result
    save_cache()
    return result

def update_film_ids(conn, film_id: int, imdb_id: Optional[str], tmdb_id: Optional[str]):
    with conn.cursor() as cursor:
        cursor.execute(
            "UPDATE film SET imdb_id=%s, tmdb_id=%s WHERE id=%s",
            (imdb_id, tmdb_id, film_id)
        )

def main():
    conn = conn_open()
    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("SELECT id, title, year, imdb_id, tmdb_id FROM film")
        films = cursor.fetchall()

    updated, not_found = 0, 0

    for film in films:
        if film["imdb_id"] and film["tmdb_id"]:
            continue  # already has both IDs

        ids = find_tmdb_and_imdb(film["title"], film["year"])
        if ids and (ids["imdb_id"] or ids["tmdb_id"]):
            update_film_ids(conn, film["id"], ids["imdb_id"], ids["tmdb_id"])
            print(f"Updated: {film['title']} ({film['year']}) → IMDb: {ids['imdb_id']}, TMDB: {ids['tmdb_id']}")
            updated += 1
        else:
            print(f"Not found: {film['title']} ({film['year']})")
            not_found += 1

    print(f"Done. Updated {updated}, Not found: {not_found}")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()