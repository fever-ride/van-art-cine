#!/usr/bin/env python3
"""
Enrich film records with OMDb metadata (PostgreSQL version).

- Fetches OMDb data by IMDb ID when available, otherwise by title/year
- Updates film table fields (rated, genre, language, country, awards,
  rt_rating_pct, imdb_rating, imdb_votes, description)
- Inserts people (director/writer/cast) via upsert_person / upsert_film_person

Usage:
    python omdb_api.py                  # never-enriched films only (default)
    python omdb_api.py --limit 20       # cap this run to 20 films (canary)
    python omdb_api.py --all            # re-fetch every film regardless of omdb_synced_at

Env:
  - OMDB_API_KEY in database/.env
  - DATABASE_URL in database/.env (used by db_helper.conn_open)
"""

import argparse
import html
import os
import sys
import re
from pathlib import Path
from typing import Optional, Dict, Any, List, MutableMapping

import psycopg2
import requests
from dotenv import load_dotenv

from db_helper import (
    conn_open,
    fetch_films_needing_omdb,
    upsert_person,
    upsert_film_person,
    reconnect,
)
from http_retry import get_with_retry
from log_setup import get_logger

log = get_logger("omdb_api")

# ---------- Environment ----------
SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
ENV_PATH = DB_DIR / ".env"

if not ENV_PATH.exists():
    log.error(f"Configuration file not found: {ENV_PATH}")
    log.error("Please ensure .env file exists with OMDB_API_KEY and DATABASE_URL.")
    sys.exit(1)

load_dotenv(ENV_PATH)

OMDB_API_KEY = os.getenv("OMDB_API_KEY")
if not OMDB_API_KEY:
    log.error("OMDB_API_KEY not found in .env file")
    sys.exit(1)

OMDB_URL = "https://www.omdbapi.com/"

HTTP = requests.Session()
HTTP.headers.update({"Accept": "application/json"})


# ---------- OMDb helpers ----------
class OmdbQuotaExceeded(Exception):
    """Raised when OMDb reports its daily request quota has been used up.

    Retrying won't help until the quota resets, so callers should stop the
    run early instead of burning through every remaining film with a
    guaranteed-useless 401.
    """


def fetch_omdb_data(
    film: Dict[str, Any],
    stats: Optional[MutableMapping[str, int]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Prefer IMDb ID (exact), fallback to title/year.
    Returns parsed JSON or None.
    Retries on rate limiting (429), server errors (5xx), and transient
    network errors. Raises OmdbQuotaExceeded if OMDb reports the daily
    request limit has been reached (HTTP 401 + "Request limit reached").
    If `stats` is provided, increments HTTP / transport counters for the run summary.
    """
    if film.get("imdb_id"):
        params = {"apikey": OMDB_API_KEY, "i": film["imdb_id"]}
    else:
        params = {"apikey": OMDB_API_KEY, "t": film["title"]}
        if film.get("year"):
            params["y"] = film["year"]

    resp = get_with_retry(HTTP, OMDB_URL, params, stats=stats, label="OMDb")
    if resp is None:
        return None
    if resp.status_code == 200:
        return resp.json()
    if resp.status_code == 401 and "request limit reached" in resp.text.lower():
        raise OmdbQuotaExceeded(resp.text[:200])
    log.warning(f"[OMDb] HTTP {resp.status_code}: {resp.text[:200]}")
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


def _clean_text(val: Optional[str]) -> Optional[str]:
    """Decode HTML entities (e.g. '&apos;', '&amp;') OMDb sometimes embeds
    in free-text fields, so we don't store/display escaped markup."""
    if not val:
        return None
    return html.unescape(val)


def update_film_omdb_fields(conn, film_id: int, omdb_data: Dict[str, Any]) -> None:
    rt_pct = parse_rt_percent(omdb_data)
    imdb_rating = parse_imdb_rating(omdb_data)
    imdb_votes = parse_imdb_votes(omdb_data)
    plot = _clean_text(omdb_data.get("Plot"))  # store as description

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
                description = %s,
                omdb_synced_at = NOW()
            WHERE id = %s
            """,
            (
                _clean_text(omdb_data.get("Rated")),
                _clean_text(omdb_data.get("Genre")),
                _clean_text(omdb_data.get("Language")),
                _clean_text(omdb_data.get("Country")),
                _clean_text(omdb_data.get("Awards")),
                rt_pct,
                imdb_rating,
                imdb_votes,
                plot,
                film_id,
            ),
        )


def _mark_no_omdb_match(conn, film_id: int) -> None:
    """Stamp omdb_synced_at for a film OMDb definitively has no catalog entry
    for (HTTP 200, Response=False). This is a real answer, not a transient
    failure, so we don't want to keep re-querying it on every incremental run."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE film SET omdb_synced_at = NOW() WHERE id = %s", (film_id,))


def _write_film_omdb_data(conn, film: Dict[str, Any], omdb_data: Dict[str, Any]) -> None:
    """Persist one film's OMDb fields + people links. Assumes it's called
    inside the per-row retry loop in main(), so it's fine to just execute
    and let the caller commit/retry."""
    update_film_omdb_fields(conn, film["id"], omdb_data)

    # people: Director / Writer / Actors
    for role in ["Director", "Writer", "Actors"]:
        names = _clean_text(omdb_data.get(role)) or ""
        for name in (n.strip() for n in names.split(",")):
            # OMDb uses the literal string "N/A" (not an empty field) when a
            # film has no director/writer/cast on record. Without this check
            # that gets upserted as a real person named "N/A" and linked to
            # every such film.
            if not name or name.upper() == "N/A":
                continue
            person_id = upsert_person(conn, name)
            upsert_film_person(
                conn,
                film["id"],
                person_id,
                role.lower() if role != "Actors" else "cast",
            )


def _write_with_reconnect(conn, write_fn, *, label: str, reconnects: List[int]) -> Any:
    """
    Run `write_fn(conn)` and commit, retrying once with a fresh connection if
    the connection was dropped server-side. Returns (conn, success: bool).
    `reconnects` is a 1-element list used as an out-parameter counter.
    """
    for attempt in range(2):
        try:
            write_fn(conn)
            conn.commit()
            return conn, True
        except psycopg2.OperationalError as e:
            log.warning(
                f"DB connection lost while writing {label!r} ({e}); reconnecting..."
            )
            conn = reconnect(conn)
            reconnects[0] += 1
            if attempt == 1:
                log.error(f"Giving up on {label!r} after reconnect retry")
    return conn, False


# ---------- Main ----------
def main():
    parser = argparse.ArgumentParser(
        description="Enrich film records with OMDb metadata")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Re-fetch OMDb data for every film, including ones already "
             "enriched (omdb_synced_at IS NOT NULL). Default: only films "
             "never successfully enriched. Ratings/awards can change over "
             "time — this does NOT refresh them; use a dedicated refresh "
             "job for that.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap how many films to enrich this run (oldest id first). "
             "Useful for a small canary run against a new environment "
             "before letting a large batch spend real OMDb quota.",
    )
    # run_all.py's import_and_run() resets sys.argv to just [module_name]
    # before calling main(), so this is a no-op ([] -> defaults) unless
    # this script is invoked directly, e.g. `python omdb_api.py --all`.
    args = parser.parse_args(sys.argv[1:])

    conn = conn_open()
    try:
        films = fetch_films_needing_omdb(
            conn, include_already_synced=args.all, limit=args.limit
        )
        found, not_found, reconnects = 0, 0, [0]
        omdb_response_false = 0  # HTTP 200 but OMDb says no match
        omdb_stats = {
            "http_429": 0,
            "http_4xx": 0,
            "http_5xx": 0,
            "request_exc": 0,
        }
        quota_exceeded_at: Optional[int] = None

        log.info(
            f"Fetching OMDb data for {len(films)} film(s) "
            f"({'all films' if args.all else 'never-enriched films only'})"
        )

        for idx, film in enumerate(films):
            try:
                omdb_data = fetch_omdb_data(film, omdb_stats)
            except OmdbQuotaExceeded as e:
                log.warning(
                    f"[OMDb] Daily request limit reached ({e}); stopping early "
                    f"instead of burning through the remaining {len(films) - idx} films."
                )
                quota_exceeded_at = idx
                break

            if not omdb_data:
                # Transient failure (network/4xx after retries) — leave
                # omdb_synced_at untouched so this film is retried next run.
                log.warning(
                    f"[MISS] {film['title']} ({film.get('year') or ''})  imdb_id={film.get('imdb_id') or '-'}")
                not_found += 1
                continue
            if omdb_data.get("Response") == "False":
                # Definitive "no such title" answer — stamp omdb_synced_at so
                # we don't keep re-querying a title that will never match.
                omdb_response_false += 1
                log.info(
                    f"[MISS] {film['title']} ({film.get('year') or ''})  imdb_id={film.get('imdb_id') or '-'}")
                conn, _ = _write_with_reconnect(
                    conn,
                    lambda c: _mark_no_omdb_match(c, film["id"]),
                    label=film["title"],
                    reconnects=reconnects,
                )
                not_found += 1
                continue

            # DB writes happen after all the (potentially slow) OMDb work is
            # done, and are committed per-film, so a dropped connection only
            # costs us a reconnect + retry of this one row, not the whole run.
            conn, write_ok = _write_with_reconnect(
                conn,
                lambda c: _write_film_omdb_data(c, film, omdb_data),
                label=film["title"],
                reconnects=reconnects,
            )
            if not write_ok:
                not_found += 1
                continue
            found += 1

            # brief success log with key fields
            rt = parse_rt_percent(omdb_data)
            ir = parse_imdb_rating(omdb_data)
            iv = parse_imdb_votes(omdb_data)
            log.info(
                f"[OK] {film['title']} ({film.get('year') or ''})  "
                f"imdb_id={film.get('imdb_id') or omdb_data.get('imdbID') or '-'}  "
                f"Rated={omdb_data.get('Rated') or '-'}  RT%={rt if rt is not None else '-'}  "
                f"IMDb={ir if ir is not None else '-'} ({iv if iv is not None else '-'})"
            )

        log.info(f"Done. OMDb updated: {found}  |  Rows without metadata: {not_found}")
        if quota_exceeded_at is not None:
            log.warning(
                f"Stopped early at film {quota_exceeded_at + 1}/{len(films)} "
                f"due to OMDb daily quota; re-run later to continue "
                f"(already-enriched films won't be re-fetched)."
            )
        if reconnects[0]:
            log.info(f"DB reconnected {reconnects[0]} time(s) mid-run")
        log.info(
            f"OMDb API summary — HTTP 429: {omdb_stats['http_429']}  |  "
            f"4xx (other): {omdb_stats['http_4xx']}  |  "
            f"5xx: {omdb_stats['http_5xx']}  |  "
            f"request errors: {omdb_stats['request_exc']}"
        )
        log.info(
            f"OMDb Response=False (no match in catalog): {omdb_response_false}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
