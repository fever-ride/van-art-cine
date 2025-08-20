import pymysql
import re

# === CONFIG ===
DB = dict(
    host="127.0.0.1",
    user="vancine",
    password="10045978",
    database="vancine",
    charset="utf8mb4",
    autocommit=True,
)

def conn_open():
    return pymysql.connect(**DB)

def norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())

def norm_title(t: str | None) -> str:
    if not t: return ""
    t = t.replace("’", "'")
    return norm_space(t).lower()

def strip_dir_prefix(name: str | None) -> str | None:
    if not name: return None
    return re.sub(r"^\s*dir\.?\s*", "", name, flags=re.I)

def remove_parentheses(text: str) -> str:
    """
    Examples:
    - "dirty money (4k restoration)" -> "dirty money"
    - "The Movie (2023 (Director's Cut))" -> "The Movie"
    - "Unclosed paren (something" -> "Unclosed paren"
    - "Normal title" -> "Normal title"
    """
    result = text
    while True:
        new_result = re.sub(r'\([^()]*\)', '', result)
        if new_result == result:
            # Remove any unclosed parenthesis and following text
            new_result = re.sub(r'\([^)]*$', '', result)
            return norm_space(new_result)
        result = new_result

def fetch_all_films(conn):
    with conn.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute("SELECT * FROM film")
        return cursor.fetchall()

def upsert_person(conn, name, imdb_id=None, tmdb_id=None):
    norm_name = norm_space(name).lower()
    with conn.cursor() as cursor:
        cursor.execute("SELECT id FROM person WHERE normalized_name = %s", (norm_name,))
        result = cursor.fetchone()
        if result:
            return result[0]
        cursor.execute(
            "INSERT INTO person (name, imdb_id, tmdb_id) VALUES (%s, %s, %s)",
            (name, imdb_id, tmdb_id)
        )
        return cursor.lastrowid

def upsert_film_person(conn, film_id, person_id, role):
    with conn.cursor() as cursor:
        cursor.execute(
            "REPLACE INTO film_person (film_id, person_id, role) VALUES (%s, %s, %s)",
            (film_id, person_id, role)
        )
