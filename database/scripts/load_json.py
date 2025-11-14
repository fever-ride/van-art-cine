#!/usr/bin/env python3
"""
Load scraped movie screening data into the vancine database (PostgreSQL version).

- Reads JSON files from data/latest/ (or specified paths)
- Normalizes entity data (cinemas, films, people)
- Resolves entity references using normalized values
- Stages data in stg_screening table for validation
- Maintains data integrity through careful deduplication

Usage:
    python scripts/load_json.py [file1.json file2.json ...]

If no files specified, processes default set:
- cinematheque_screenings_latest.json
- viff_screenings_latest.json
- rio_screenings_latest.json
"""

import json
import os
import re
import sys
import hashlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from aliases import resolve_cinema_alias

from dateutil import parser as dtparser

from db_helper import (
    conn_open,
    norm_space,
    norm_title,
    strip_dir_prefix,
    normalize_person_name,
)

from ai_cleaning import ai_clean_title_and_tags

# =========================
# Config
# =========================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
DATA_DIR = os.path.join(PROJECT_ROOT, "data", "latest")
# DATA_DIR = os.path.join(PROJECT_ROOT, "data", "test")

LOCAL_TZ = ZoneInfo("America/Vancouver")
UTC = ZoneInfo("UTC")


# =========================
# Small utilities
# =========================


def find_latest_files(directory):
    """
    Scan directory and return the latest file for each cinema:
    - cinematheque
    - viff
    - rio

    Returns a list of file paths.
    """
    prefix_list = ["cinematheque_screenings_",
                   "viff_screenings_", "rio_screenings_"]
    result = []

    all_files = [f for f in os.listdir(directory) if f.endswith(".json")]

    for prefix in prefix_list:
        # Filter by prefix
        matched = [f for f in all_files if f.startswith(prefix)]
        if not matched:
            continue

        # Sort by timestamp in filename
        # because YYYYMMDD_HHMMSS is lexicographically sortable
        matched.sort(reverse=True)

        # Pick newest
        newest = matched[0]
        result.append(os.path.join(directory, newest))

    return result


def infer_show_year_from_month(date_str: str, base_year: int) -> int:
    """
    Given a 'month day' style date_str (without year) and a base_year,
    adjust the year for cross-year schedules.

    Rule:
      - Normally use base_year.
      - But if current month is Oct/Nov/Dec and the show month is Jan–Jun,
        treat it as next year (base_year + 1).
    """
    try:
        # Use a dummy default date; we only care about the parsed month.
        dummy_default = datetime(base_year, 1, 1)
        parsed = dtparser.parse(
            date_str, default=dummy_default, dayfirst=False)
        show_month = parsed.month
    except Exception:
        # If parsing fails, just fall back to base_year.
        return base_year

    now = datetime.now(LOCAL_TZ)
    current_month = now.month

    year = base_year
    if current_month in (10, 11, 12) and show_month in (1, 2, 3, 4, 5, 6):
        year = base_year + 1

    return year


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
# SQL snippets (PostgreSQL)
# =========================
SQL = {
    # Requires: cinema(name) UNIQUE
    "cinema_ins": """
INSERT INTO cinema (name, website, address)
VALUES (%s, %s, %s)
ON CONFLICT (name) DO UPDATE
  SET website = EXCLUDED.website,
      address = EXCLUDED.address
""",
    # Requires: film(normalized_title, year) UNIQUE
    "film_ins": """
INSERT INTO film (title, year, description, imdb_id, tmdb_id, normalized_title)
VALUES (%s, %s, %s, %s, %s, %s)
ON CONFLICT (normalized_title, year) DO UPDATE
  SET description = EXCLUDED.description,
      normalized_title = EXCLUDED.normalized_title
""",
    # Requires: person(normalized_name) UNIQUE
    "person_ins": """
INSERT INTO person (name, imdb_id, tmdb_id, normalized_name)
VALUES (%s, %s, %s, %s)
ON CONFLICT (normalized_name) DO UPDATE
  SET name = EXCLUDED.name
""",
    # Requires: film_person(film_id, person_id, role) UNIQUE/PK
    "film_person_ins": """
INSERT INTO film_person (film_id, person_id, role)
VALUES (%s, %s, %s)
ON CONFLICT (film_id, person_id, role) DO NOTHING
""",
    "stg_screening_ins": """
INSERT INTO stg_screening (
    film_id, cinema_id, start_at_utc, end_at_utc, runtime_min, tz,
    source, source_uid, source_url, notes, raw_date, raw_time,
    content_hash, loaded_at_utc, tags
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
""",
    # Store full raw payload for auditing; cast to jsonb
    "raw_import_ins": """
INSERT INTO raw_import (cinema_id, fetched_at, source, payload)
VALUES (%s, now(), %s, %s::jsonb)
""",
}


# =========================
# DB helpers
# =========================
def upsert(cur, sql, params):
    cur.execute(sql, params)


def fetch_one(cur, sql, params):
    """Execute a SQL query and return the first row or None."""
    cur.execute(sql, params)
    return cur.fetchone()


def ensure_cinema(cur, cinema_name, cinema_website=None):
    upsert(cur, SQL["cinema_ins"], (cinema_name, cinema_website, None))
    row = fetch_one(
        cur, "SELECT id FROM cinema WHERE name = %s", (cinema_name,))
    return row[0]


def ensure_film(cur, title, year, description=None, imdb=None, tmdb=None):
    """Find or create a film record, using normalized title for deduplication."""
    normalized = norm_title(title)

    # Postgres NULL-safe equality: IS NOT DISTINCT FROM
    row = fetch_one(
        cur,
        "SELECT id FROM film WHERE normalized_title = LOWER(%s) AND year IS NOT DISTINCT FROM %s",
        (normalized, year),
    )
    if row:
        return row[0]

    upsert(cur, SQL["film_ins"], (title, year,
           description, imdb, tmdb, normalized))

    row = fetch_one(
        cur,
        "SELECT id FROM film WHERE normalized_title = LOWER(%s) AND year IS NOT DISTINCT FROM %s",
        (normalized, year),
    )
    if row:
        return row[0]


def ensure_person(cur, name, imdb=None, tmdb=None):
    """Find or create a person record, using normalized name for deduplication."""
    if not name or not name.strip():
        raise ValueError("Person name cannot be empty")

    normalized = normalize_person_name(name)
    if not normalized:
        raise ValueError(f"Cannot normalize person name: '{name}'")

    if imdb:
        row = fetch_one(
            cur, "SELECT id FROM person WHERE imdb_id = %s", (imdb,))
        if row:
            return row[0]

    if tmdb:
        row = fetch_one(
            cur, "SELECT id FROM person WHERE tmdb_id = %s", (tmdb,))
        if row:
            return row[0]

    row = fetch_one(
        cur, "SELECT id FROM person WHERE normalized_name = %s", (normalized,))
    if row:
        return row[0]

    upsert(cur, SQL["person_ins"], (name, imdb, tmdb, normalized))

    row = fetch_one(
        cur, "SELECT id FROM person WHERE normalized_name = %s", (normalized,))
    if row:
        return row[0]

    raise RuntimeError(
        f"Could not insert or find person: {name} (normalized: {normalized})")


def link_directors(cur, film_id, director_field):
    """Best-effort to insert director persons and link."""
    if not director_field:
        return
    cleaned = strip_dir_prefix(director_field)
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
      - '2025-Sep-28' + '1:30 pm'
    """
    t = normalize_ampm(time_str)
    d = (date_str or "").strip()

    for fmt in ("%Y-%B-%d %I:%M %p", "%Y-%b-%d %I:%M %p"):
        try:
            return datetime.strptime(f"{d} {t}", fmt)
        except ValueError:
            pass

    return dtparser.parse(f"{d} {t}")


def parse_dt_viff(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    """
    VIFF examples (date_str):
      - 'Fri Nov 08'
      - 'Thu Jan 02'

    year_hint comes from the caller (typically current year in LOCAL_TZ),
    but we adjust it for cross-year schedules using infer_show_year_from_month.
    """
    t = normalize_ampm(time_str)

    # Fall back to current local year if no hint is given.
    base_year = year_hint if year_hint is not None else datetime.now(
        LOCAL_TZ).year
    year_for_show = infer_show_year_from_month(date_str, base_year)

    try:
        # Example format: 'Fri Nov 08 2025 7:00 PM'
        return datetime.strptime(
            f"{date_str} {year_for_show} {t}",
            "%a %b %d %Y %I:%M %p",
        )
    except ValueError:
        # Fallback to dateutil if the format changes.
        return dtparser.parse(
            f"{date_str} {year_for_show} {t}",
            dayfirst=False,
        )


def parse_dt_rio(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    """
    Rio examples (date_str):
      - 'Friday January 3'
      - 'Sunday March 15'

    We use year_hint as the base year and adjust with infer_show_year_from_month.
    """
    # Rio times often look like '7:00pm' (no space before am/pm).
    t = normalize_ampm(time_str).replace(" ", "")

    base_year = year_hint if year_hint is not None else datetime.now(
        LOCAL_TZ).year
    year_for_show = infer_show_year_from_month(date_str, base_year)

    try:
        # Example: 'Friday January 3 2026 7:00pm'
        return datetime.strptime(
            f"{date_str} {year_for_show} {t}",
            "%A %B %d %Y %I:%M%p",
        )
    except ValueError:
        # Fallback if Rio changes the text format.
        return dtparser.parse(
            f"{date_str} {year_for_show} {t}",
            dayfirst=False,
        )


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
    """
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)

    # Audit record (one per source run)
    default_cid = ensure_cinema(cur, cinema_name, cinema_website)
    upsert(
        cur,
        SQL["raw_import_ins"],
        (default_cid, source_name, json.dumps(rows, ensure_ascii=False)),
    )

    loaded_at_utc = datetime.now(UTC).replace(tzinfo=None)

    # Clear staging for this source
    cur.execute("DELETE FROM stg_screening WHERE source = %s", (source_name,))

    def eq_ci(a: str | None, b: str | None) -> bool:
        return (a or "").strip().lower() == (b or "").strip().lower()

    for r in rows:
        raw_title = r.get("title") or ""

        # --- AI: normalize title + extract screening-level tags from title ---
        try:
            cleaned = ai_clean_title_and_tags(raw_title)
            clean_title = cleaned.get("normalized_title") or raw_title
            base_screening_tags = cleaned.get("screening_tags") or []
            base_screening_tags = [
                str(t).strip() for t in base_screening_tags if str(t).strip()
            ]
        except Exception as e:
            print(
                f"[AI FALLBACK] source={source_name} title='{raw_title}' error={e}")
            clean_title = raw_title
            base_screening_tags = []

        year = parse_year(r.get("year"))
        runtime = parse_runtime_minutes(r.get("duration"))

        # Use cleaned title when upserting film
        film_id = ensure_film(cur, clean_title, year, r.get("description"))
        link_directors(cur, film_id, r.get("director"))

        for st in r.get("showtimes", []):
            scraped_cinema = (st.get("venue") or "").strip()
            candidate_name = scraped_cinema or cinema_name

            canonical = resolve_cinema_alias(source_name, candidate_name)
            resolved_name = canonical or candidate_name

            same_as_default = eq_ci(resolved_name, cinema_name)
            this_cinema_site = cinema_website if same_as_default else None

            cid = ensure_cinema(cur, resolved_name, this_cinema_site)

            date_str = (st.get("date") or "").strip()
            time_str = (st.get("time") or "").strip()
            if is_missing_token(date_str) or is_missing_token(time_str):
                print(
                    f"[SKIP] {source_name}: '{raw_title}' missing time/date → "
                    f"date='{date_str}' time='{time_str}'"
                )
                continue

            if year_hint is not None:
                dt_local = parse_dt_func(date_str, time_str, year_hint)
            else:
                dt_local = parse_dt_func(date_str, time_str)

            start_utc = to_utc(dt_local)
            end_utc = guess_end(start_utc, runtime)

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

            # Clone base tags so we could later add per-showtime tags if needed
            screening_tags = list(base_screening_tags)

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
                    None,           # notes
                    st.get("date"),
                    st.get("time"),
                    content_hash,
                    loaded_at_utc,
                    screening_tags,  # <-- tags: text[] column
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
    # 1. Decide which files to load
    if len(sys.argv) > 1:
        # Files given on command line -> use them as absolute paths
        files = [os.path.abspath(f) for f in sys.argv[1:]]
    else:
        # No args -> use auto-discovered latest files under DATA_DIR
        if not os.path.isdir(DATA_DIR):
            print(f"Error: Data directory not found: {DATA_DIR}")
            print(
                "Run this script from the project root or specify input files on the command line.")
            sys.exit(1)

        files = find_latest_files(DATA_DIR)
        if not files:
            print(f"Error: No screening JSON files found in: {DATA_DIR}")
            print(
                "Expected files named like 'cinematheque_screenings_YYYYMMDD_HHMMSS.json', etc.")
            sys.exit(1)

    # 2. Sanity-check file existence
    missing = [f for f in files if not os.path.isfile(f)]
    if missing:
        print("Error: Some input files were not found:")
        for f in missing:
            print(f"  {f}")
        sys.exit(1)

    # 3. Log what we are about to load
    print(f"Loading {len(files)} files:")
    for f in files:
        print(f"  {f}")

    # 4. Open DB connection and load each file into staging
    conn = conn_open()
    try:
        with conn:
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
