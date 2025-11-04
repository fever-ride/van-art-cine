#!/usr/bin/env python3
"""
Load scraped movie screening data into the vancine database.

This script processes JSON files containing movie screening information from various
sources (Cinematheque, VIFF, Rio) and loads them into the vancine database. It:

1. Reads JSON files from data/latest/ (or specified paths)
2. Normalizes entity data (cinemas, films, people)
3. Resolves entity references using normalized values
4. Stages data in stg_screening table for validation
5. Maintains data integrity through careful deduplication

The staging process runs one source at a time, clearing previous staged data
for that source before loading new data. This ensures clean, atomic updates
and allows validation before merging to live tables.

Usage:
    python scripts/load_json.py [file1.json file2.json ...]
    
    If no files specified, processes default set:
    - cinematheque_screenings_latest.json
    - viff_screenings_latest.json 
    - rio_screenings_latest.json

Environment:
    Requires database configuration in .env or environment variables
    See database/README.md for configuration details
"""

import json
import os
import re
import sys
import hashlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from aliases import resolve_cinema_alias

import pymysql
from dateutil import parser as dtparser

from db_helper import DB, conn_open, norm_space, norm_title, strip_dir_prefix


# =========================
# Config
# =========================

# Determine project root and data directory paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
DATA_DIR = os.path.join(PROJECT_ROOT, "data", "latest")

# Timezone configuration
LOCAL_TZ = ZoneInfo("America/Vancouver")
UTC = ZoneInfo("UTC")

# Default input files (relative to DATA_DIR)
DEFAULT_FILES = [
    "cinematheque_screenings_latest.json",
    "viff_screenings_latest.json",
    "rio_screenings_latest.json",
]


# =========================
# Small utilities
# =========================
def parse_runtime_minutes(s: str | int | None) -> int | None:
    """Accepts '111 mins', '98 min', '111', None -> int or None."""
    if s is None:
        return None
    if isinstance(s, int):
        return s
    m = re.search(r"(\d+)\s*min", s, re.I) or re.search(r"(\d+)", s)
    return int(m.group(1)) if m else None


def parse_year(s: str | int | None) -> int | None:
    """Return a plausible year or None."""
    if s is None:
        return None
    try:
        y = int(str(s).strip())
        return y if 1888 <= y <= 2100 else None
    except Exception:
        return None


def to_utc(local_dt: datetime) -> datetime:
    """Convert localized datetime -> naive UTC (DATETIME in DB)."""
    if local_dt.tzinfo is None:
        local_dt = local_dt.replace(tzinfo=LOCAL_TZ)
    return local_dt.astimezone(UTC).replace(tzinfo=None)


def guess_end(start_utc: datetime, runtime_min: int | None) -> datetime:
    """Fallback end time = start + runtime (or +0)."""
    minutes = 0 if runtime_min is None else runtime_min
    return start_utc + timedelta(minutes=minutes)


def normalize_ampm(s: str) -> str:
    """Normalize am/pm variants."""
    return (
        s.replace("a.m.", "am")
        .replace("p.m.", "pm")
        .replace("A.M.", "am")
        .replace("P.M.", "pm")
        .strip()
    )


def is_missing_token(s: str | None) -> bool:
    """Detect placeholder strings like 'No time', 'No date', etc."""
    if not s:
        return True
    t = s.strip().lower()
    return t in {"no time", "no date", "tbd", "n/a", "-", ""}


def stable_uid(cinema_id: int, film_id: int, start_at_utc: datetime) -> str:
    """Stable synthetic UID when upstream has no ID."""
    key = f"{cinema_id}|{film_id}|{start_at_utc:%Y-%m-%d %H:%M:%S}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def make_content_hash(
    film_id,
    cinema_id,
    start_utc,
    end_utc,
    runtime_min,
    tz,
    source_url,
    notes,
):
    """Hash of the key content fields used for change detection."""
    parts = [
        str(film_id),
        str(cinema_id),
        start_utc.strftime("%Y-%m-%d %H:%M:%S"),
        end_utc.strftime("%Y-%m-%d %H:%M:%S"),
        "" if runtime_min is None else str(runtime_min),
        tz or "",
        source_url or "",
        notes or "",
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


# =========================
# SQL snippets
# =========================
SQL = {
    "cinema_ins": """
INSERT INTO cinema (name, website, address)
VALUES (%s,%s,%s)
ON DUPLICATE KEY UPDATE website=VALUES(website), address=VALUES(address)
""",
    "film_ins": """
INSERT INTO film (title, year, description, imdb_id, tmdb_id, normalized_title)
VALUES (%s,%s,%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE description=VALUES(description), normalized_title=VALUES(normalized_title)
""",
    "person_ins": """
INSERT INTO person (name, imdb_id, tmdb_id, normalized_name)
VALUES (%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE name=VALUES(name), normalized_name=VALUES(normalized_name)
""",
    "film_person_ins": """
INSERT IGNORE INTO film_person (film_id, person_id, role) VALUES (%s,%s,%s)
""",
    # Insert into staging table; we clear staging per source, so no upsert here.
    "stg_screening_ins": """
INSERT INTO stg_screening (
    film_id, cinema_id, start_at_utc, end_at_utc, runtime_min, tz,
    source, source_uid, source_url, notes, raw_date, raw_time,
    content_hash, loaded_at_utc
) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
""",
    "raw_import_ins": """
INSERT INTO raw_import (cinema_id, fetched_at, source, payload)
VALUES (%s, NOW(), %s, CAST(%s AS JSON))
""",
}


# =========================
# DB helpers
# =========================
def upsert(cur, sql, params):
    cur.execute(sql, params)


def fetch_one(cur, sql, params):
    """Execute a SQL query and return the first row.

    Args:
        cur: Database cursor
        sql: SQL query string with %s placeholders
        params: Tuple of parameter values to bind

    Returns:
        First row of results or None if no results

    Raises:
        Exception if query fails
    """
    cur.execute(sql, params)
    return cur.fetchone()


def ensure_cinema(cur, cinema_name, cinema_website=None):
    upsert(cur, SQL["cinema_ins"], (cinema_name, cinema_website, None))
    row = fetch_one(cur, "SELECT id FROM cinema WHERE name=%s", (cinema_name,))
    return row[0]


def ensure_film(cur, title, year, description=None, imdb=None, tmdb=None):
    """Find or create a film record, using normalized title for deduplication.

    Args:
        cur: Database cursor
        title: Film title (original form)
        year: Release year or None 
        description: Optional film description
        imdb: Optional IMDB ID
        tmdb: Optional TMDB ID

    Returns:
        film_id: Primary key of found or created film record

    Notes:
        - Uses normalized_title for reliable duplicate detection
        - Year can be NULL (using <=> operator in comparison)
        - Updates description and normalized_title on duplicate key
    """
    # Normalize title for consistent lookup
    normalized = norm_title(title)

    # Try to find existing film by normalized title and year
    row = fetch_one(
        cur,
        "SELECT id FROM film WHERE normalized_title=LOWER(%s) AND (year <=> %s)",
        (normalized, year)
    )
    if row:
        return row[0]

    # Insert new film record with normalized title
    upsert(cur, SQL["film_ins"], (title, year,
           description, imdb, tmdb, normalized))

    # Retrieve the newly inserted film
    row = fetch_one(
        cur,
        "SELECT id FROM film WHERE normalized_title=LOWER(%s) AND (year <=> %s)",
        (normalized, year)
    )
    if row:
        return row[0]


def ensure_person(cur, name, imdb=None, tmdb=None):
    """Find or create a person record, using normalized name for deduplication.

    Args:
        cur: Database cursor
        name: Person's name
        imdb: Optional IMDB ID
        tmdb: Optional TMDB ID

    Returns:
        person_id: Primary key of found or created person record

    Notes:
        - Uses normalized_name for duplicate detection
        - Falls back to normalized version of the name field
        - Updates name on duplicate key
    """
    normalized = norm_title(name)
    sql = "SELECT id FROM person WHERE normalized_name = %s"
    row = fetch_one(cur, sql, (normalized,))
    if row:
        return row[0]

    # Insert and try again
    normalized = norm_title(name)
    upsert(cur, SQL["person_ins"], (name, imdb, tmdb, normalized))
    row = fetch_one(
        cur, "SELECT id FROM person WHERE normalized_name = %s", (normalized,))
    if row:
        return row[0]

    # If we get here, something is very wrong
    raise RuntimeError(
        f"Could not insert or find person: {name} (normalized: {normalized})")


def link_directors(cur, film_id, director_field):
    """Best-effort to insert director persons and link."""
    if not director_field:
        return
    cleaned = strip_dir_prefix(director_field)
    # split on ',', '&', '/', ' and '
    names = re.split(r",|&|/| and ", cleaned)
    for n in [norm_space(x) for x in names if norm_space(x)]:
        pid = ensure_person(cur, n)
        upsert(cur, SQL["film_person_ins"], (film_id, pid, "director"))


# =========================
# Source-specific datetime parsers
# =========================
def parse_dt_cinematheque(date_str: str, time_str: str) -> datetime:
    """
    Cinematheque examples:
      - '2025-October-02' + '7:00 PM'
      - '2025-Sep-28' + '1:30 pm' (short month just in case)
    We try strict formats first, then fall back to dateutil.
    """
    t = normalize_ampm(time_str)
    d = (date_str or "").strip()

    # Handle exact 'YYYY-FullMonthName-DD' and 'YYYY-Mon-DD'
    for fmt in ("%Y-%B-%d %I:%M %p", "%Y-%b-%d %I:%M %p"):
        try:
            return datetime.strptime(f"{d} {t}", fmt)
        except ValueError:
            pass

    # Last resort: dateutil (more permissive)
    return dtparser.parse(f"{d} {t}")


def parse_dt_viff(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    # e.g., "Mon Aug 11" + "4:00 pm" (+ year)
    t = normalize_ampm(time_str)
    try:
        return datetime.strptime(f"{date_str} {year_hint} {t}", "%a %b %d %Y %I:%M %p")
    except ValueError:
        return dtparser.parse(f"{date_str} {year_hint} {t}", dayfirst=False)


def parse_dt_rio(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    # e.g., "Sunday July 27" + "1:45 p.m."
    t = normalize_ampm(time_str).replace(" ", "")
    try:
        return datetime.strptime(f"{date_str} {year_hint} {t}", "%A %B %d %Y %I:%M%p")
    except ValueError:
        return dtparser.parse(f"{date_str} {year_hint} {t}")


# =========================
# Loader (writes to staging)
# =========================
def load_source(
    cur,
    path,
    source_name,
    cinema_name,
    cinema_website,
    parse_dt_func,
    year_hint=None,
):
    """
    For this source, we accept a default (cinema_name, cinema_website),
    but for each showtime we prefer the exact cinema name scraped as st['venue'].
    If st['venue'] equals the default cinema_name (case-insensitive), we keep
    cinema_website; otherwise website=None.
    """
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)

    # Audit record (one per source run)
    default_cid = ensure_cinema(cur, cinema_name, cinema_website)
    upsert(cur, SQL["raw_import_ins"], (default_cid,
           source_name, json.dumps(rows, ensure_ascii=False)))

    loaded_at_utc = datetime.now(UTC).replace(tzinfo=None)

    # Clear staging for this source
    cur.execute("DELETE FROM stg_screening WHERE source=%s", (source_name,))

    def eq_ci(a: str | None, b: str | None) -> bool:
        return (a or "").strip().lower() == (b or "").strip().lower()

    for r in rows:
        title = r.get("title")
        year = parse_year(r.get("year"))
        runtime = parse_runtime_minutes(r.get("duration"))
        film_id = ensure_film(cur, title, year, r.get("description"))
        link_directors(cur, film_id, r.get("director"))

        for st in r.get("showtimes", []):
            # --- Per-showtime cinema from scraped venue ---
            scraped_cinema = (st.get("venue") or "").strip()

            # pick a candidate name (scraped or default)
            candidate_name = scraped_cinema or cinema_name

            # resolve alias → canonical name (if any)
            canonical = resolve_cinema_alias(source_name, candidate_name)
            resolved_name = canonical or candidate_name

            # website rule
            same_as_default = eq_ci(resolved_name, cinema_name)
            this_cinema_site = cinema_website if same_as_default else None

            # ensure/get canonical cinema id
            cid = ensure_cinema(cur, resolved_name, this_cinema_site)

            # --- Guard against missing date/time placeholders ---
            date_str = (st.get("date") or "").strip()
            time_str = (st.get("time") or "").strip()
            if is_missing_token(date_str) or is_missing_token(time_str):
                print(
                    f"[SKIP] {source_name}: '{title}' missing time/date → "
                    f"date='{date_str}' time='{time_str}'"
                )
                continue

            # --- Parse local datetime ---
            if year_hint is not None:
                dt_local = parse_dt_func(date_str, time_str, year_hint)
            else:
                dt_local = parse_dt_func(date_str, time_str)

            start_utc = to_utc(dt_local)
            end_utc = guess_end(start_utc, runtime)

            # --- IDs & content hash ---
            upstream_id = st.get("id") or r.get("id")
            source_uid = upstream_id or stable_uid(cid, film_id, start_utc)
            content_hash = make_content_hash(
                film_id,
                cid,
                start_utc,
                end_utc,
                runtime,
                "America/Vancouver",
                r.get("detail_url"),
                None,
            )

            # --- Insert into staging ---
            upsert(
                cur,
                SQL["stg_screening_ins"],
                (
                    film_id,
                    cid,
                    start_utc,
                    end_utc,
                    runtime,
                    "America/Vancouver",
                    source_name,
                    source_uid,
                    r.get("detail_url"),
                    None,  # notes
                    st.get("date"),
                    st.get("time"),
                    content_hash,
                    loaded_at_utc,
                ),
            )


# =========================
# Source wrappers
# =========================
def load_cinematheque(cur, path):
    load_source(
        cur,
        path,
        "cinematheque",
        "The Cinematheque",
        "https://thecinematheque.ca",
        parse_dt_cinematheque,
    )


def load_viff(cur, path):
    load_source(
        cur,
        path,
        "viff",
        "VIFF Centre",
        "https://viff.org",
        parse_dt_viff,
        datetime.now(LOCAL_TZ).year,
    )


def load_rio(cur, path):
    load_source(
        cur,
        path,
        "rio",
        "Rio Theatre",
        "https://riotheatre.ca",
        parse_dt_rio,
        datetime.now(LOCAL_TZ).year,
    )


# =========================
# Main
# =========================
def main():
    # Get list of files to process
    if len(sys.argv) > 1:
        # Use files specified on command line (convert to absolute paths)
        files = [os.path.abspath(f) for f in sys.argv[1:]]
    else:
        # Use default files from data/latest/
        files = [os.path.join(DATA_DIR, f) for f in DEFAULT_FILES]
        if not os.path.isdir(DATA_DIR):
            print(f"Error: Data directory not found: {DATA_DIR}")
            print(
                "Run this script from the project root or specify input files on command line.")
            sys.exit(1)

    # Validate files exist
    missing = [f for f in files if not os.path.isfile(f)]
    if missing:
        print("Error: Some input files not found:")
        for f in missing:
            print(f"  {f}")
        sys.exit(1)

    print(f"Loading {len(files)} files:")
    for f in files:
        print(f"  {f}")

    conn = conn_open()
    try:
        with conn.cursor() as cur:
            for fp in files:
                name = os.path.basename(fp).lower()
                if "cinematheque" in name:
                    load_cinematheque(cur, fp)
                elif "viff" in name:
                    load_viff(cur, fp)
                elif "rio" in name:
                    load_rio(cur, fp)
                else:
                    print(f"[SKIP] Unrecognized file: {fp}")
        print("✅ Staging load complete. Run merge SQL to promote to live screening table.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
