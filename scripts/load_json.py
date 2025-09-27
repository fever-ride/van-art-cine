import json
import os
import re
import sys
import glob
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pymysql
from dateutil import parser as dtparser
from db_helper import DB, conn_open, norm_space, norm_title, strip_dir_prefix

# === CONFIG ===
DATA_DIR = "data/latest"
LOCAL_TZ = ZoneInfo("America/Vancouver")
UTC = ZoneInfo("UTC")

DEFAULT_FILES = [
    "cinematheque_screenings_latest.json",
    "viff_screenings_latest.json",
    "rio_screenings_latest.json",
]

# === UTILITIES ===


def parse_runtime_minutes(s: str | int | None) -> int | None:
    # Accepts '111 mins', '98 min', '111', None
    if s is None:
        return None
    if isinstance(s, int):
        return s
    m = re.search(r"(\d+)\s*min", s, re.I) or re.search(r"(\d+)", s)
    return int(m.group(1)) if m else None


def parse_year(s: str | int | None) -> int | None:
    if s is None:
        return None
    try:
        y = int(str(s).strip())
        return y if 1888 <= y <= 2100 else None
    except Exception:
        return None


def to_utc(local_dt: datetime) -> datetime:
    if local_dt.tzinfo is None:
        local_dt = local_dt.replace(tzinfo=LOCAL_TZ)
    return local_dt.astimezone(UTC).replace(tzinfo=None)


def guess_end(start_utc: datetime, runtime_min: int | None) -> datetime:
    minutes = 0 if runtime_min is None else runtime_min
    return start_utc + timedelta(minutes=minutes)

# === DB HELPERS ===


def upsert(cur, sql, params):
    cur.execute(sql, params)


def fetch_one(cur, sql, params):
    cur.execute(sql, params)
    return cur.fetchone()


SQL = {
    "cinema_ins": """
INSERT INTO cinema (name, website, address)
VALUES (%s,%s,%s)
ON DUPLICATE KEY UPDATE website=VALUES(website), address=VALUES(address)
""",
    "film_ins": """
INSERT INTO film (title, year, description, imdb_id, tmdb_id)
VALUES (%s,%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE description=VALUES(description)
""",
    "person_ins": """
INSERT INTO person (name, imdb_id, tmdb_id)
VALUES (%s,%s,%s)
ON DUPLICATE KEY UPDATE name=VALUES(name)
""",
    "film_person_ins": """
INSERT IGNORE INTO film_person (film_id, person_id, role) VALUES (%s,%s,%s)
""",
    "screening_ins": """
INSERT INTO screening (film_id, cinema_id, start_at_utc, end_at_utc, runtime_min, tz, source_url, notes, raw_date, raw_time)
VALUES (%s,%s,%s,%s,%s,'America/Vancouver',%s,%s,%s,%s)
ON DUPLICATE KEY UPDATE source_url=VALUES(source_url), notes=VALUES(notes)
""",
    "raw_import_ins": """
INSERT INTO raw_import (cinema_id, fetched_at, payload) VALUES (%s, NOW(), CAST(%s AS JSON))
"""
}


def ensure_cinema(cur, cinema_name, cinema_website=None):
    upsert(cur, SQL["cinema_ins"], (cinema_name, cinema_website, None))
    row = fetch_one(cur, "SELECT id FROM cinema WHERE name=%s", (cinema_name,))
    cid = row[0]

    return cid


def ensure_film(cur, title, year, description=None, imdb=None, tmdb=None):
    upsert(cur, SQL["film_ins"], (title, year, description, imdb, tmdb))
    row = fetch_one(cur,
                    "SELECT id FROM film WHERE normalized_title=LOWER(%s) AND (year <=> %s)",
                    (norm_title(title), year))
    return row[0]


def ensure_person(cur, name, imdb=None, tmdb=None):
    upsert(cur, SQL["person_ins"], (name, imdb, tmdb))
    row = fetch_one(
        cur, "SELECT id FROM person WHERE normalized_name=LOWER(%s)", (norm_title(name),))
    return row[0]


def link_directors(cur, film_id, director_field):
    if not director_field:
        return
    cleaned = strip_dir_prefix(director_field)
    # split on ',', '&', '/', ' and '
    names = re.split(r",|&|/| and ", cleaned)
    for n in [norm_space(x) for x in names if norm_space(x)]:
        pid = ensure_person(cur, n)
        upsert(cur, SQL["film_person_ins"], (film_id, pid, 'director'))


def normalize_ampm(s: str) -> str:
    # "1:45 p.m." -> "1:45 pm"
    return s.replace("a.m.", "am").replace("p.m.", "pm").replace("A.M.", "am").replace("P.M.", "pm").strip()

# === PARSERS FOR EACH SOURCE ===


def parse_dt_cinematheque(date_str: str, time_str: str) -> datetime:
    time_str = normalize_ampm(time_str)
    try:
        # 2025-August-15 07:00 PM
        dt_local = datetime.strptime(
            f"{date_str} {time_str}", "%Y-%B-%d %I:%M %p")
    except ValueError:
        # fallback: dateutil parse
        dt_local = dtparser.parse(f"{date_str} {time_str}")
    return dt_local


def parse_dt_viff(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    # e.g., "Mon Aug 11" + "4:00 pm" (+ year)
    time_str = normalize_ampm(time_str)
    try:
        return datetime.strptime(f"{date_str} {year_hint} {time_str}", "%a %b %d %Y %I:%M %p")
    except ValueError:
        return dtparser.parse(f"{date_str} {year_hint} {time_str}", dayfirst=False)


def parse_dt_rio(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    # e.g., "Sunday July 27" + "1:45 p.m."
    time_str = normalize_ampm(time_str).replace(" ", "")
    try:
        return datetime.strptime(f"{date_str} {year_hint} {time_str}", "%A %B %d %Y %I:%M%p")
    except ValueError:
        return dtparser.parse(f"{date_str} {year_hint} {time_str}")

# === LOADERS ===


def load_cinematheque(cur, path):
    cinema = "The Cinematheque"
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    cid = ensure_cinema(
        cur, cinema, "https://thecinematheque.ca")
    upsert(cur, SQL["raw_import_ins"],
           (cid, json.dumps(rows, ensure_ascii=False)))

    for r in rows:
        title = r.get("title")
        year = parse_year(r.get("year"))
        runtime = parse_runtime_minutes(r.get("duration"))
        film_id = ensure_film(cur, title, year, r.get("description"))
        link_directors(cur, film_id, r.get("director"))
        for st in r.get("showtimes", []):
            dt_local = parse_dt_cinematheque(
                st.get("date", ""), st.get("time", ""))
            start_utc = to_utc(dt_local)
            end_utc = guess_end(start_utc, runtime)
            upsert(cur, SQL["screening_ins"], (
                film_id, cid, start_utc, end_utc, runtime,
                r.get("detail_url"), None, st.get("date"), st.get("time")
            ))


def load_viff(cur, path):
    cinema = "VIFF Centre"
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    cid = ensure_cinema(
        cur, cinema, "https://viff.org")
    upsert(cur, SQL["raw_import_ins"],
           (cid, json.dumps(rows, ensure_ascii=False)))

    for r in rows:
        title = r.get("title")
        runtime = parse_runtime_minutes(r.get("duration"))
        year = parse_year(r.get("year"))
        film_id = ensure_film(cur, title, year, r.get("description"))
        link_directors(cur, film_id, r.get("director"))
        screening_year = datetime.now(LOCAL_TZ).year
        for st in r.get("showtimes", []):
            dt_local = parse_dt_viff(
                st.get("date", ""), st.get("time", ""), screening_year)
            start_utc = to_utc(dt_local)
            end_utc = guess_end(start_utc, runtime)
            upsert(cur, SQL["screening_ins"], (
                film_id, cid, start_utc, end_utc, runtime,
                r.get("detail_url"), None, st.get("date"), st.get("time")
            ))


def load_rio(cur, path):
    cinema = "Rio Theatre"
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    cid = ensure_cinema(
        cur, cinema, "https://riotheatre.ca")
    upsert(cur, SQL["raw_import_ins"],
           (cid, json.dumps(rows, ensure_ascii=False)))

    for r in rows:
        title = r.get("title")
        runtime = parse_runtime_minutes(r.get("duration"))
        year = parse_year(r.get("year"))
        film_id = ensure_film(cur, title, year, r.get("description"))
        link_directors(cur, film_id, r.get("director"))
        screening_year = datetime.now(LOCAL_TZ).year
        for st in r.get("showtimes", []):
            dt_local = parse_dt_rio(
                st.get("date", ""), st.get("time", ""), screening_year)
            start_utc = to_utc(dt_local)
            end_utc = guess_end(start_utc, runtime)
            upsert(cur, SQL["screening_ins"], (
                film_id, cid, start_utc, end_utc, runtime,
                r.get("detail_url"), None, st.get("date"), st.get("time")
            ))

# === MAIN ===


def main():
    # Allow passing file paths on CLI; otherwise use defaults
    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        files = [os.path.join(DATA_DIR, f) for f in DEFAULT_FILES]

    if not files:
        print("No input JSON files found. Set DATA_DIR or pass files on CLI.")
        sys.exit(1)

    print("Loading files:", files)

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
                    print(f"Skipping unrecognized file: {fp}")
        print("✅ Load complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
