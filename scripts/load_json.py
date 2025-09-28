import json
import os
import re
import sys
import glob
import hashlib
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


def stable_uid(cinema_id: int, film_id: int, start_at_utc: datetime) -> str:
    key = f"{cinema_id}|{film_id}|{start_at_utc:%Y-%m-%d %H:%M:%S}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def make_content_hash(film_id, cinema_id, start_utc, end_utc,
                      runtime_min, tz, source_url, notes):
    parts = [
        str(film_id), str(cinema_id),
        start_utc.strftime("%Y-%m-%d %H:%M:%S"),
        end_utc.strftime("%Y-%m-%d %H:%M:%S"),
        "" if runtime_min is None else str(runtime_min),
        tz or "",
        source_url or "",
        notes or "",
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()

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
    # Insert into staging table, no ON DUPLICATE because we clear staging each run
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
"""
}


def ensure_cinema(cur, cinema_name, cinema_website=None):
    upsert(cur, SQL["cinema_ins"], (cinema_name, cinema_website, None))
    row = fetch_one(cur, "SELECT id FROM cinema WHERE name=%s", (cinema_name,))
    return row[0]


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
    names = re.split(r",|&|/| and ", cleaned)
    for n in [norm_space(x) for x in names if norm_space(x)]:
        pid = ensure_person(cur, n)
        upsert(cur, SQL["film_person_ins"], (film_id, pid, 'director'))


def normalize_ampm(s: str) -> str:
    return s.replace("a.m.", "am").replace("p.m.", "pm").replace("A.M.", "am").replace("P.M.", "pm").strip()

# === PARSERS ===


def parse_dt_cinematheque(date_str: str, time_str: str) -> datetime:
    time_str = normalize_ampm(time_str)
    try:
        return datetime.strptime(f"{date_str} {time_str}", "%Y-%B-%d %I:%M %p")
    except ValueError:
        return dtparser.parse(f"{date_str} {time_str}")


def parse_dt_viff(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    time_str = normalize_ampm(time_str)
    try:
        return datetime.strptime(f"{date_str} {year_hint} {time_str}", "%a %b %d %Y %I:%M %p")
    except ValueError:
        return dtparser.parse(f"{date_str} {year_hint} {time_str}", dayfirst=False)


def parse_dt_rio(date_str: str, time_str: str, year_hint: int | None) -> datetime:
    time_str = normalize_ampm(time_str).replace(" ", "")
    try:
        return datetime.strptime(f"{date_str} {year_hint} {time_str}", "%A %B %d %Y %I:%M%p")
    except ValueError:
        return dtparser.parse(f"{date_str} {year_hint} {time_str}")

# === LOADERS (now insert into stg_screening) ===


def load_source(cur, path, source_name, cinema_name, cinema_website, parse_dt_func, year_hint=None):
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    cid = ensure_cinema(cur, cinema_name, cinema_website)
    upsert(cur, SQL["raw_import_ins"], (cid, source_name,
           json.dumps(rows, ensure_ascii=False)))

    loaded_at_utc = datetime.now(UTC).replace(tzinfo=None)

    # clear staging rows for this source before inserting new ones
    cur.execute("DELETE FROM stg_screening WHERE source=%s", (source_name,))

    for r in rows:
        title = r.get("title")
        year = parse_year(r.get("year"))
        runtime = parse_runtime_minutes(r.get("duration"))
        film_id = ensure_film(cur, title, year, r.get("description"))
        link_directors(cur, film_id, r.get("director"))
        for st in r.get("showtimes", []):
            dt_local = parse_dt_func(st.get("date", ""), st.get("time", "")) if not year_hint else \
                parse_dt_func(st.get("date", ""),
                              st.get("time", ""), year_hint)
            start_utc = to_utc(dt_local)
            end_utc = guess_end(start_utc, runtime)
            upstream_id = st.get("id") or r.get("id")
            source_uid = upstream_id or stable_uid(cid, film_id, start_utc)
            content_hash = make_content_hash(
                film_id, cid, start_utc, end_utc, runtime,
                "America/Vancouver", r.get("detail_url"), None
            )
            upsert(cur, SQL["stg_screening_ins"], (
                film_id, cid, start_utc, end_utc, runtime,
                "America/Vancouver", source_name, source_uid, r.get(
                    "detail_url"),
                None, st.get("date"), st.get("time"),
                content_hash, loaded_at_utc
            ))


def load_cinematheque(cur, path):
    load_source(cur, path, "cinematheque", "The Cinematheque",
                "https://thecinematheque.ca", parse_dt_cinematheque)


def load_viff(cur, path):
    load_source(cur, path, "viff", "VIFF Centre", "https://viff.org",
                parse_dt_viff, datetime.now(LOCAL_TZ).year)


def load_rio(cur, path):
    load_source(cur, path, "rio", "Rio Theatre", "https://riotheatre.ca",
                parse_dt_rio, datetime.now(LOCAL_TZ).year)

# === MAIN ===


def main():
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
        print("✅ Staging load complete. Run merge SQL to promote to live screening table.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
