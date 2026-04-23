#!/usr/bin/env python3
"""
Generate embeddings for films that don't have one yet.

Uses OpenAI text-embedding-3-small (1536 dimensions).
Builds a doc text from film metadata + directors, then upserts into film_embedding.

Incremental by default (skips films that already have embeddings).
Pass --all to regenerate all embeddings.

Env (from database/.env):
  - OPENAI_API_KEY
  - DATABASE_URL
"""

import os
import sys
import time
import argparse
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
load_dotenv(DB_DIR / ".env")

from db_helper import conn_open

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
BATCH_SIZE = 20
DELAY_S = 0.5

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def get_film_ids_needing_embeddings(conn, force_all=False):
    with conn.cursor() as cur:
        if force_all:
            cur.execute("SELECT id FROM film ORDER BY id")
        else:
            cur.execute("""
                SELECT f.id FROM film f
                LEFT JOIN film_embedding fe ON f.id = fe.film_id
                WHERE fe.film_id IS NULL
                ORDER BY f.id
            """)
        return [row[0] for row in cur.fetchall()]


def build_doc_text(conn, film_id):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT title, year, genre, language, country, rated, awards, description, tags
            FROM film WHERE id = %s
        """, (film_id,))
        row = cur.fetchone()
        if not row:
            return None

        title, year, genre, language, country, rated, awards, description, tags = row

        cur.execute("""
            SELECT p.name FROM film_person fp
            JOIN person p ON fp.person_id = p.id
            WHERE fp.film_id = %s AND fp.role = 'director'
        """, (film_id,))
        directors = [r[0] for r in cur.fetchall()]

    parts = [f"Title: {title}"]
    if year:
        parts.append(f"Year: {year}")
    if directors:
        parts.append(f"Director: {', '.join(directors)}")
    if genre:
        parts.append(f"Genre: {genre}")
    if language:
        parts.append(f"Language: {language}")
    if country:
        parts.append(f"Country: {country}")
    if rated:
        parts.append(f"Rated: {rated}")
    if awards:
        parts.append(f"Awards: {awards}")
    if description:
        parts.append(f"Description: {description}")
    if tags:
        parts.append(f"Tags: {', '.join(tags)}")

    return "\n".join(parts)


def generate_embedding(text):
    res = client.embeddings.create(model=EMBED_MODEL, input=text, dimensions=EMBED_DIM)
    return res.data[0].embedding


def upsert_embedding(conn, film_id, embedding, doc_text):
    vec_literal = "[" + ",".join(str(v) for v in embedding) + "]"
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO film_embedding (film_id, embedding, doc_text, model, created_at, updated_at)
            VALUES (%s, %s::vector, %s, %s, NOW(), NOW())
            ON CONFLICT (film_id) DO UPDATE
              SET embedding = EXCLUDED.embedding,
                  doc_text = EXCLUDED.doc_text,
                  model = EXCLUDED.model,
                  updated_at = NOW()
        """, (film_id, vec_literal, doc_text, EMBED_MODEL))
    conn.commit()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate film embeddings")
    parser.add_argument("--all", action="store_true", help="Regenerate all embeddings")
    args = parser.parse_args(argv)

    conn = conn_open()
    try:
        film_ids = get_film_ids_needing_embeddings(conn, force_all=args.all)
        mode = "--all" if args.all else "incremental"
        print(f"[embeddings] {mode}: {len(film_ids)} films to process")

        if not film_ids:
            print("[embeddings] nothing to do")
            return

        done = 0
        errors = 0

        for i in range(0, len(film_ids), BATCH_SIZE):
            batch = film_ids[i:i + BATCH_SIZE]

            for film_id in batch:
                try:
                    doc_text = build_doc_text(conn, film_id)
                    if not doc_text:
                        continue
                    embedding = generate_embedding(doc_text)
                    upsert_embedding(conn, film_id, embedding, doc_text)
                    done += 1
                except Exception as e:
                    errors += 1
                    print(f"  error film {film_id}: {e}", file=sys.stderr)

            print(f"[embeddings] {done + errors}/{len(film_ids)} processed ({errors} errors)")

            if i + BATCH_SIZE < len(film_ids):
                time.sleep(DELAY_S)

        print(f"[embeddings] done: {done} embedded, {errors} errors")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
