#!/usr/bin/env python3
"""
Merge staging -> live for screenings (PostgreSQL).
Counts inserted/updated/deactivated and logs to ops_ingest_run.

Usage:
  python scripts/merge_staging_to_live.py           # apply changes
  python scripts/merge_staging_to_live.py --dry-run # preview only
"""

import argparse
from db_helper import conn_open

SQL_INSERT = """
WITH ins AS (
  INSERT INTO screening (
    film_id,
    cinema_id,
    start_at_utc,
    end_at_utc,
    runtime_min,
    tz,
    source,
    source_uid,
    source_url,
    notes,
    raw_date,
    raw_time,
    content_hash,
    loaded_at_utc,
    ingest_run_id,
    is_active,
    tags,
    created_at,
    updated_at
  )
  SELECT
    s.film_id,
    s.cinema_id,
    s.start_at_utc,
    s.end_at_utc,
    s.runtime_min,
    s.tz,
    s.source,
    s.source_uid,
    s.source_url,
    s.notes,
    s.raw_date,
    s.raw_time,
    s.content_hash,
    s.loaded_at_utc,
    %s,
    TRUE,
    s.tags,
    NOW(),
    NOW()
  FROM stg_screening s
  ON CONFLICT (source, source_uid) DO NOTHING
  RETURNING 1
)
SELECT COUNT(*) FROM ins
"""

SQL_UPDATE = """
WITH upd AS (
  UPDATE screening t
  SET
    film_id       = s.film_id,
    cinema_id     = s.cinema_id,
    start_at_utc  = s.start_at_utc,
    end_at_utc    = s.end_at_utc,
    runtime_min   = s.runtime_min,
    tz            = s.tz,
    source_url    = s.source_url,
    notes         = s.notes,
    raw_date      = s.raw_date,
    raw_time      = s.raw_time,
    content_hash  = s.content_hash,
    loaded_at_utc = s.loaded_at_utc,
    ingest_run_id = %s,
    is_active     = TRUE,
    tags          = s.tags,
    updated_at    = NOW()
  FROM stg_screening s
  WHERE t.source = s.source
    AND t.source_uid = s.source_uid
    AND (
      t.film_id       IS DISTINCT FROM s.film_id OR
      t.cinema_id     IS DISTINCT FROM s.cinema_id OR
      t.start_at_utc  IS DISTINCT FROM s.start_at_utc OR
      t.end_at_utc    IS DISTINCT FROM s.end_at_utc OR
      t.runtime_min   IS DISTINCT FROM s.runtime_min OR
      t.tz            IS DISTINCT FROM s.tz OR
      t.source_url    IS DISTINCT FROM s.source_url OR
      t.notes         IS DISTINCT FROM s.notes OR
      t.raw_date      IS DISTINCT FROM s.raw_date OR
      t.raw_time      IS DISTINCT FROM s.raw_time OR
      t.content_hash  IS DISTINCT FROM s.content_hash OR
      t.is_active     IS DISTINCT FROM TRUE OR
      t.tags          IS DISTINCT FROM s.tags
    )
  RETURNING 1
)
SELECT COUNT(*) FROM upd
"""

SQL_DEACTIVATE = """
WITH deact AS (
  UPDATE screening
  SET is_active = FALSE
  WHERE is_active = TRUE
    AND (ingest_run_id IS DISTINCT FROM %s)
  RETURNING 1
)
SELECT COUNT(*) FROM deact
"""


def run_merge(dry_run: bool) -> None:
    conn = conn_open()
    try:
        with conn:  # opens a transaction; commits on success unless we rollback
            with conn.cursor() as cur:
                # 0) start a run
                cur.execute(
                    "INSERT INTO ops_ingest_run (started_at, status) VALUES (NOW(), 'running') RETURNING id"
                )
                run_id = cur.fetchone()[0]

                # 1) rows in staging
                cur.execute("SELECT COUNT(*) FROM stg_screening")
                rows_in = cur.fetchone()[0]

                # 2) insert new
                cur.execute(SQL_INSERT, (run_id,))
                rows_inserted = cur.fetchone()[0]

                # 3) update changed
                cur.execute(SQL_UPDATE, (run_id,))
                rows_updated = cur.fetchone()[0]

                # 4) deactivate untouched
                cur.execute(SQL_DEACTIVATE, (run_id,))
                rows_deactivated = cur.fetchone()[0]

                # 5) finish the run (mark success even in dry-run; counters still useful)
                cur.execute(
                    """
                    UPDATE ops_ingest_run
                    SET finished_at = NOW(),
                        status = %s,
                        rows_in = %s,
                        rows_inserted = %s,
                        rows_updated = %s,
                        rows_deactivated = %s
                    WHERE id = %s
                    """,
                    (
                        "success" if not dry_run else "success_dry_run",
                        rows_in,
                        rows_inserted,
                        rows_updated,
                        rows_deactivated,
                        run_id,
                    ),
                )

                if dry_run:
                    # preview only → rollback everything inside this transaction
                    conn.rollback()
                    print(
                        f"[DRY RUN] rows_in={rows_in}, inserted={rows_inserted}, "
                        f"updated={rows_updated}, deactivated={rows_deactivated}"
                    )
                    print("[DRY RUN] Transaction rolled back. No changes applied.")
                else:
                    print(
                        f"rows_in={rows_in}, inserted={rows_inserted}, "
                        f"updated={rows_updated}, deactivated={rows_deactivated}"
                    )
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser(
        description="Merge staging -> live (PostgreSQL)"
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying",
    )
    args = ap.parse_args()
    run_merge(args.dry_run)


if __name__ == "__main__":
    main()
