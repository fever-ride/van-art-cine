#!/usr/bin/env python3

import os
import requests
from dotenv import load_dotenv

# Load API key from .env (same as your backfill script)
load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
if not TMDB_API_KEY:
    print("❌ TMDB_API_KEY not found in environment.")
    exit(1)

TMDB_BASE = "https://api.themoviedb.org/3"
IMAGE_BASE = "https://image.tmdb.org/t/p/w500"   # common size for posters


def test_search(title):
    print(f"\n=== Searching TMDB for: {title} ===")
    url = f"{TMDB_BASE}/search/movie"
    params = {
        "api_key": TMDB_API_KEY,
        "query": title
    }

    resp = requests.get(url, params=params)
    print(f"HTTP Status: {resp.status_code}")

    if resp.status_code != 200:
        print("❌ Failed request:", resp.text)
        return

    data = resp.json()
    results = data.get("results", [])

    if not results:
        print("No results found.")
        return

    movie = results[0]  # take first result
    print("First result:")
    print("  Title:", movie.get("title"))
    print("  Release date:", movie.get("release_date"))
    print("  TMDB ID:", movie.get("id"))
    print("  Poster path:", movie.get("poster_path"))

    # Build full URL if poster exists
    poster_path = movie.get("poster_path")
    if poster_path:
        full_url = IMAGE_BASE + poster_path
        print("  Full poster URL:")
        print(" ", full_url)
    else:
        print("  No poster available for this title.")


if __name__ == "__main__":
    # Try with a few well-known films
    test_search("Parasite")
    test_search("Inception")
    test_search("La La Land")
