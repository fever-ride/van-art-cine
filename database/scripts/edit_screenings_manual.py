"""
Small CLI helper to manually CREATE / UPDATE / DEACTIVATE / DELETE rows
in the `screening` table.

This is meant for occasional admin fixes when the ingest pipeline
needs a hand-tuned correction.

Examples:

  # Create a screening
  python edit_screenings_manual.py create \
    --film-id 42 \
    --cinema-id 3 \
    --start "2025-11-25T19:30" \
    --runtime 120 \
    --source-url "https://example.com/showtime" \
    --notes "Special one-off screening"

  # Update time + notes
  # Note: updating start_at_utc does not auto-adjust end_at_utc; 
  # update both fields together if needed.
  python edit_screenings_manual.py update \
    --id 123 \
    --start "2025-11-25T20:00" \
    --runtime 110 \
    --notes "Time changed"

  # Deactivate (soft delete)
  python edit_screenings_manual.py deactivate --id 123

  # Hard delete (watchlist_screening rows are removed via ON DELETE CASCADE)
  python edit_screenings_manual.py delete --id 123
"""

import argparse
from datetime import datetime, timedelta

from db_helper import conn_open


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_iso_datetime(value: str) -> datetime:
    """
    Parse a simple datetime string like:
      2025-11-25T19:30  or  2025-11-25 19:30  (seconds optional)
    """
    value = value.strip()
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise argparse.ArgumentTypeError(f"Invalid datetime format: {value!r}")


def ensure_film_and_cinema(cur, film_id: int, cinema_id: int) -> None:
    """Raise argparse.ArgumentTypeError if either FK does not exist."""
    cur.execute("SELECT 1 FROM film WHERE id = %s", (film_id,))
    if not cur.fetchone():
        raise argparse.ArgumentTypeError(f"film.id={film_id} does not exist")

    cur.execute("SELECT 1 FROM cinema WHERE id = %s", (cinema_id,))
    if not cur.fetchone():
        raise argparse.ArgumentTypeError(
            f"cinema.id={cinema_id} does not exist")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_create(args):
    """
    Create a new screening row.

    Required fields:
      - film_id
      - cinema_id
      - start_at_utc
      - source_url

    Other fields:
      - runtime_min (optional; used to compute end_at_utc)
      - tz (defaults to America/Vancouver)
      - source (defaults to 'manual')
      - notes, tags (optional)
    """
    conn = conn_open()
    try:
        with conn:
            with conn.cursor() as cur:
                # Validate FKs
                ensure_film_and_cinema(cur, args.film_id, args.cinema_id)

                start_at = args.start
                runtime = args.runtime or 0
                end_at = start_at + \
                    timedelta(minutes=runtime) if runtime else start_at

                tags = args.tags or []

                cur.execute(
                    """
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
            content_hash,
            loaded_at_utc,
            ingest_run_id,
            notes,
            raw_date,
            raw_time,
            is_active,
            tags,
            created_at,
            updated_at
          )
          VALUES (
            %s, %s, %s, %s, %s,
            %s,
            %s,
            NULL,
            %s,
            NULL,
            NOW(),
            NULL,
            %s,
            NULL,
            NULL,
            TRUE,
            %s,
            NOW(),
            NOW()
          )
          RETURNING id
          """,
                    (
                        args.film_id,
                        args.cinema_id,
                        start_at,
                        end_at,
                        runtime or None,
                        args.tz,
                        args.source,
                        args.source_url,
                        args.notes or "",
                        tags,
                    ),
                )
                new_id = cur.fetchone()[0]
                print(f"Created screening id={new_id}")
    finally:
        conn.close()


def cmd_update(args):
    """
    Update selected fields of an existing screening.

    You can change:
      - film_id, cinema_id
      - start_at_utc, end_at_utc, runtime_min
      - tz, source, source_url
      - notes, is_active, tags

    Only fields you pass are updated.
    """
    conn = conn_open()
    try:
        with conn:
            with conn.cursor() as cur:
                # Load current row to know film_id/cinema_id defaults
                cur.execute(
                    """
          SELECT film_id, cinema_id
          FROM screening
          WHERE id = %s
          """,
                    (args.id,),
                )
                row = cur.fetchone()
                if not row:
                    print(f"No screening found with id={args.id}")
                    return

                current_film_id, current_cinema_id = row

                # If changing film_id or cinema_id, validate FKs
                new_film_id = args.film_id if args.film_id is not None else current_film_id
                new_cinema_id = args.cinema_id if args.cinema_id is not None else current_cinema_id
                ensure_film_and_cinema(cur, new_film_id, new_cinema_id)

                sets = []
                params = []

                if args.film_id is not None:
                    sets.append("film_id = %s")
                    params.append(args.film_id)

                if args.cinema_id is not None:
                    sets.append("cinema_id = %s")
                    params.append(args.cinema_id)

                if args.start is not None:
                    sets.append("start_at_utc = %s")
                    params.append(args.start)

                if args.end is not None:
                    sets.append("end_at_utc = %s")
                    params.append(args.end)

                if args.runtime is not None:
                    sets.append("runtime_min = %s")
                    params.append(args.runtime)

                if args.tz is not None:
                    sets.append("tz = %s")
                    params.append(args.tz)

                if args.source is not None:
                    sets.append("source = %s")
                    params.append(args.source)

                if args.source_url is not None:
                    sets.append("source_url = %s")
                    params.append(args.source_url)

                if args.notes is not None:
                    sets.append("notes = %s")
                    params.append(args.notes)

                if args.tags is not None:
                    sets.append("tags = %s")
                    params.append(args.tags)

                if args.is_active is not None:
                    sets.append("is_active = %s")
                    params.append(args.is_active)

                if not sets:
                    print("Nothing to update (no fields provided).")
                    return

                sets.append("updated_at = NOW()")

                sql = f"""
          UPDATE screening
          SET {", ".join(sets)}
          WHERE id = %s
          RETURNING id
        """
                params.append(args.id)

                cur.execute(sql, params)
                updated = cur.fetchone()
                if not updated:
                    print(f"No screening found with id={args.id}")
                else:
                    print(f"Updated screening id={args.id}")
    finally:
        conn.close()


def cmd_deactivate(args):
    """
    Soft delete: set is_active = FALSE.
    Does not touch watchlist_screening; those rows stay but now point
    to an inactive screening.
    """
    conn = conn_open()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
          UPDATE screening
          SET is_active = FALSE, updated_at = NOW()
          WHERE id = %s
          RETURNING id
          """,
                    (args.id,),
                )
                row = cur.fetchone()
                if not row:
                    print(f"No screening found with id={args.id}")
                else:
                    print(f"Deactivated screening id={args.id}")
    finally:
        conn.close()


def cmd_delete(args):
    """
    Hard delete a screening row.

    Dependencies:
      - watchlist_screening has `screening_id` with ON DELETE CASCADE,
        so related watchlist rows are automatically removed by Postgres.
    """
    conn = conn_open()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM screening WHERE id = %s RETURNING id", (args.id,))
                row = cur.fetchone()
                if not row:
                    print(f"No screening found with id={args.id}")
                else:
                    print(f"Deleted screening id={args.id}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI wiring
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Manual helper for CRUD operations on `screening` table"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # create
    p_create = sub.add_parser("create", help="Create a new screening")
    p_create.add_argument("--film-id", type=int, required=True)
    p_create.add_argument("--cinema-id", type=int, required=True)
    p_create.add_argument(
        "--start",
        type=parse_iso_datetime,
        required=True,
        help="Start time in UTC, e.g. 2025-11-25T19:30",
    )
    p_create.add_argument(
        "--runtime",
        type=int,
        help="Runtime in minutes (optional; used to compute end_at_utc)",
    )
    p_create.add_argument(
        "--tz",
        default="America/Vancouver",
        help='Timezone string (default: "America/Vancouver")',
    )
    p_create.add_argument(
        "--source",
        default="manual",
        help='Source string (default: "manual")',
    )
    p_create.add_argument(
        "--source-url",
        required=True,
        help="Non-null source_url for the screening",
    )
    p_create.add_argument("--notes", help="Notes (optional)")
    p_create.add_argument(
        "--tags",
        nargs="*",
        help="Tags as a list of strings (optional)",
    )
    p_create.set_defaults(func=cmd_create)

    # update
    p_update = sub.add_parser("update", help="Update an existing screening")
    p_update.add_argument("--id", type=int, required=True)
    p_update.add_argument("--film-id", type=int, help="New film_id (optional)")
    p_update.add_argument("--cinema-id", type=int,
                          help="New cinema_id (optional)")
    p_update.add_argument(
        "--start",
        type=parse_iso_datetime,
        help="New start_at_utc (optional)",
    )
    p_update.add_argument(
        "--end",
        type=parse_iso_datetime,
        help="New end_at_utc (optional)",
    )
    p_update.add_argument(
        "--runtime",
        type=int,
        help="New runtime_min in minutes (optional)",
    )
    p_update.add_argument("--tz", help="New tz (optional)")
    p_update.add_argument("--source", help="New source (optional)")
    p_update.add_argument("--source-url", help="New source_url (optional)")
    p_update.add_argument("--notes", help="New notes (optional)")
    p_update.add_argument(
        "--tags",
        nargs="*",
        help="Replace tags with given list (optional)",
    )
    p_update.add_argument(
        "--active",
        dest="is_active",
        action="store_true",
        help="Mark as active",
    )
    p_update.add_argument(
        "--inactive",
        dest="is_active",
        action="store_false",
        help="Mark as inactive",
    )
    p_update.set_defaults(func=cmd_update)

    # deactivate
    p_deact = sub.add_parser("deactivate", help="Set is_active = FALSE")
    p_deact.add_argument("--id", type=int, required=True)
    p_deact.set_defaults(func=cmd_deactivate)

    # delete
    p_delete = sub.add_parser("delete", help="Hard delete a screening")
    p_delete.add_argument("--id", type=int, required=True)
    p_delete.set_defaults(func=cmd_delete)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
