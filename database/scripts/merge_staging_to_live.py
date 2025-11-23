"""
Merge staging -> live for screenings (PostgreSQL).

- We treat stg_screening as the "truth" for future (upcoming) screenings.
- Only screenings with start_at_utc >= cutoff (now, in UTC) are affected.
- Past screenings (start_at_utc < cutoff) are left untouched by this script.

For upcoming screenings:

  1) INSERT new rows into screening for any staging rows that do not yet exist,
     avoiding conflicts on BOTH:
       - (source, source_uid)             [ingest identity]
       - (cinema_id, film_id, start_at_utc)  [business identity]

  2) UPDATE existing screening rows where the staging content has changed,
     matched by (source, cinema_id, film_id, start_at_utc).

  3) DEACTIVATE upcoming non-manual screening rows in live that no longer have
     a corresponding row in staging with the same
     (source, cinema_id, film_id, start_at_utc).

All operations are logged to ops_ingest_run.

Usage:
  python scripts/merge_staging_to_live.py           # apply changes
  python scripts/merge_staging_to_live.py --dry-run # preview only (no changes)
"""

import argparse
from datetime import datetime
from db_helper import conn_open

# ---------------------------------------------------------------------------
# SQL statements
# ---------------------------------------------------------------------------

# INSERT new upcoming screenings from staging → live.
# We:
#   - filter to upcoming rows in staging (s.start_at_utc >= cutoff)
#   - avoid inserting if there is already a screening with the same
#       (source, source_uid) OR the same (cinema_id, film_id, start_at_utc)
#   - still include ON CONFLICT (source, source_uid) DO NOTHING as a safety net
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
    %s,          -- ingest_run_id
    TRUE,        -- is_active
    s.tags,
    NOW(),
    NOW()
  FROM stg_screening s
  WHERE s.start_at_utc >= %s
    -- Do not insert if a row with the same ingest identity already exists.
    AND NOT EXISTS (
      SELECT 1
      FROM screening t
      WHERE t.source = s.source
        AND t.source_uid = s.source_uid
    )
    -- Also avoid violating the business uniqueness on (cinema_id, film_id, start_at_utc).
    AND NOT EXISTS (
      SELECT 1
      FROM screening t2
      WHERE t2.cinema_id    = s.cinema_id
        AND t2.film_id      = s.film_id
        AND t2.start_at_utc = s.start_at_utc
    )
  ON CONFLICT (source, source_uid) DO NOTHING
  RETURNING 1
)
SELECT COUNT(*) FROM ins
"""

# UPDATE existing upcoming screenings whose content has changed,
# matched via (source, cinema_id, film_id, start_at_utc).
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
  WHERE t.source       = s.source
    AND t.cinema_id    = s.cinema_id
    AND t.film_id      = s.film_id
    AND t.start_at_utc = s.start_at_utc
    AND s.start_at_utc >= %s
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
      t.tags          IS DISTINCT FROM s.tags OR
      t.is_active     IS DISTINCT FROM TRUE
    )
  RETURNING 1
)
SELECT COUNT(*) FROM upd
"""

# Preview which rows would be deactivated (used in dry-run only).
SQL_PREVIEW_DEACTIVATE = """
SELECT
  t.id,
  t.start_at_utc,
  t.source,
  t.source_uid,
  f.title,
  c.name AS cinema_name
FROM screening t
JOIN film   f ON t.film_id   = f.id
JOIN cinema c ON t.cinema_id = c.id
WHERE t.start_at_utc >= %s
  AND t.is_active = TRUE
  AND t.source <> 'manual'
  AND NOT EXISTS (
    SELECT 1
    FROM stg_screening s
    WHERE s.source       = t.source
      AND s.cinema_id    = t.cinema_id
      AND s.film_id      = t.film_id
      AND s.start_at_utc = t.start_at_utc
  )
ORDER BY t.start_at_utc, c.name, f.title;
"""

# Deactivate upcoming non-manual screenings missing in staging.
SQL_DEACTIVATE = """
WITH deact AS (
  UPDATE screening t
  SET is_active = FALSE
  WHERE t.start_at_utc >= %s
    AND t.is_active = TRUE
    AND t.source <> 'manual'
    AND NOT EXISTS (
      SELECT 1
      FROM stg_screening s
      WHERE s.source       = t.source
        AND s.cinema_id    = t.cinema_id
        AND s.film_id      = t.film_id
        AND s.start_at_utc = t.start_at_utc
    )
  RETURNING 1
)
SELECT COUNT(*) FROM deact
"""


# ---------------------------------------------------------------------------
# Merge driver
# ---------------------------------------------------------------------------

def run_merge(dry_run: bool) -> None:
    conn = conn_open()
    try:
        with conn:  # opens a transaction; commits on success unless we rollback
            with conn.cursor() as cur:
                # Cutoff for "upcoming" screenings (UTC now)
                cutoff = datetime.utcnow()

                # 0) start a run
                cur.execute(
                    "INSERT INTO ops_ingest_run (started_at, status) VALUES (NOW(), 'running') RETURNING id"
                )
                run_id = cur.fetchone()[0]

                # 1) rows in staging
                cur.execute("SELECT COUNT(*) FROM stg_screening")
                rows_in = cur.fetchone()[0]

                # 2) insert new upcoming screenings
                cur.execute(SQL_INSERT, (run_id, cutoff))
                rows_inserted = cur.fetchone()[0]

                # 3) update changed upcoming screenings (and reactivate if needed)
                cur.execute(SQL_UPDATE, (run_id, cutoff))
                rows_updated = cur.fetchone()[0]

                # 4a) in dry-run: preview which rows would be deactivated
                if dry_run:
                    cur.execute(SQL_PREVIEW_DEACTIVATE, (cutoff,))
                    preview_rows = cur.fetchall()

                    print("\n[DRY RUN] Screenings that would be deactivated:")
                    if not preview_rows:
                        print("  (none)")
                    else:
                        for (
                            sid,
                            start_at_utc,
                            source,
                            source_uid,
                            title,
                            cinema_name,
                        ) in preview_rows:
                            when_str = start_at_utc.strftime("%Y-%m-%d %H:%M")
                            print(
                                f"  id={sid} | {when_str} | {cinema_name} | {title} "
                                f"| source={source}, uid={source_uid}"
                            )

                # 4b) actually mark deactivated rows inside this transaction
                cur.execute(SQL_DEACTIVATE, (cutoff,))
                rows_deactivated = cur.fetchone()[0]

                # 5) finish the run (mark success; dry-run still rolls back later)
                cur.execute(
                    """
                    UPDATE ops_ingest_run
                    SET finished_at      = NOW(),
                        status           = 'success',
                        rows_in          = %s,
                        rows_inserted    = %s,
                        rows_updated     = %s,
                        rows_deactivated = %s
                    WHERE id = %s
                    """,
                    (
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
                        f"\n[DRY RUN] rows_in={rows_in}, inserted={rows_inserted}, "
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


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Merge staging -> live screenings (PostgreSQL)"
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without applying them to the database.",
    )
    args = ap.parse_args()
    run_merge(args.dry_run)


if __name__ == "__main__":
    main()
