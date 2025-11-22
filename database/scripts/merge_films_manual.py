#!/usr/bin/env python3
"""
Manually merge film records in the database (PostgreSQL).

This script is a template for *manual* merges where you already know
which film_id should be kept (the "canonical" record) and which film_ids
should be merged into it and removed.

You edit the MANUAL_MERGES list below to define groups like:

    MANUAL_MERGES = [
        # Keep film 42, merge 101 and 102 into it
        (42, [101, 102]),

        # Keep film 200, merge 250 into it
        (200, [250]),
    ]

For each group, the script will:

  1) Log details about the kept film and the losing films.
  2) Move references from losing films to the kept film:
       - screening.film_id
       - stg_screening.film_id
       - film_person.film_id
     taking care to avoid unique constraint violations.
  3) Delete the losing film rows.

Usage:
    python scripts/merge_films_manual.py --dry-run   # preview only
    python scripts/merge_films_manual.py             # apply changes

IMPORTANT:
  - This script is aware of all tables that reference film.id:
      * screening.film_id
      * stg_screening.film_id
      * film_person.film_id
    If you add new foreign-key relationships to film.id in the future,
    they MUST be handled here to avoid leaving broken references.

  - For screening:
      * There is a UNIQUE constraint on (cinema_id, film_id, start_at_utc).
        When moving screenings from a losing film_id to the kept one,
        we may create duplicates that violate this unique constraint.
        To avoid this, we proactively delete exact-duplicate screenings
        before updating film_id.
"""

import sys
from typing import List, Tuple, Dict, Any
from db_helper import conn_open

# ---------------------------------------------------------------------------
# EDIT THIS LIST FOR YOUR MANUAL MERGES
# Each tuple is: (keep_film_id, [list_of_loser_film_ids])
# ---------------------------------------------------------------------------

MANUAL_MERGES: List[Tuple[int, List[int]]] = [
    # Example:
    # (42, [101, 102]),
    # (200, [250]),
    (136, [198])
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_film_details(conn, film_id: int) -> Dict[str, Any]:
    """
    Fetch basic details for a film. If not found, returns {}.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   title,
                   year,
                   imdb_id,
                   tmdb_id,
                   imdb_url,
                   created_at
            FROM film
            WHERE id = %s
            """,
            (film_id,),
        )
        row = cur.fetchone()

    if not row:
        return {}

    return {
        "id": row[0],
        "title": row[1],
        "year": row[2],
        "imdb_id": row[3],
        "tmdb_id": row[4],
        "imdb_url": row[5],
        "created_at": row[6],
    }


def count_film_references(conn, film_id: int) -> Dict[str, int]:
    """
    Count how many references a film has across key tables.

    Returns:
      {
        "screening_count": int,
        "stg_screening_count": int,
        "film_person_count": int,
        "total": int,
      }
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM screening WHERE film_id = %s",
            (film_id,),
        )
        screening_count = cur.fetchone()[0]

        cur.execute(
            "SELECT COUNT(*) FROM stg_screening WHERE film_id = %s",
            (film_id,),
        )
        stg_count = cur.fetchone()[0]

        cur.execute(
            "SELECT COUNT(*) FROM film_person WHERE film_id = %s",
            (film_id,),
        )
        fp_count = cur.fetchone()[0]

    total = screening_count + stg_count + fp_count
    return {
        "screening_count": screening_count,
        "stg_screening_count": stg_count,
        "film_person_count": fp_count,
        "total": total,
    }


# ---------------------------------------------------------------------------
# Core merge logic for one manual group
# ---------------------------------------------------------------------------

def merge_film_group_manual(
    conn,
    keep_id: int,
    merge_ids: List[int],
    dry_run: bool = False,
) -> None:
    """
    Merge a group of films into a single kept film (keep_id), using
    manually specified losing IDs.

    Steps:
      1) Log summary of what will be merged.
      2) For each losing film_id in merge_ids:
           - log details and reference counts
           - if not dry-run:
               * move screening references, deduplicating conflicts
               * move stg_screening references
               * move film_person references (ON CONFLICT DO NOTHING)
               * delete the losing film row
    """
    if not merge_ids:
        return

    keep_details = get_film_details(conn, keep_id)
    if not keep_details:
        prefix = "[DRY RUN] " if dry_run else ""
        print(f"{prefix}WARNING: keep_id={keep_id} not found; skipping group.")
        return

    prefix = "[DRY RUN] " if dry_run else ""
    print(
        f"\n{prefix}Merging films into: '{keep_details.get('title')}' (ID: {keep_id})")
    print(f"  IMDB ID: {keep_details.get('imdb_id') or 'None'}")
    print(f"  TMDB ID: {keep_details.get('tmdb_id') or 'None'}")
    print(f"  IMDB URL: {keep_details.get('imdb_url') or 'None'}")

    total_refs = 0

    for mid in merge_ids:
        merge_details = get_film_details(conn, mid)
        if not merge_details:
            print(f"  {prefix}Film ID {mid} not found; skipping.")
            continue

        ref_counts = count_film_references(conn, mid)
        total_refs += ref_counts["total"]

        print(
            f"  {prefix}Merging film ID {mid}: '{merge_details.get('title')}' "
            f"(screenings={ref_counts['screening_count']}, "
            f"staging={ref_counts['stg_screening_count']}, "
            f"film_person={ref_counts['film_person_count']})"
        )

    print(f"  {prefix}Total references to move from losing films: {total_refs}")

    if dry_run:
        return

    with conn.cursor() as cur:
        for mid in merge_ids:
            merge_details = get_film_details(conn, mid)
            if not merge_details:
                # Already deleted or never existed
                continue

            # 1) Handle screening: avoid violating UNIQUE (cinema_id, film_id, start_at_utc)
            cur.execute(
                """
                DELETE FROM screening s
                USING screening k
                WHERE s.film_id = %s
                  AND k.film_id = %s
                  AND s.cinema_id = k.cinema_id
                  AND s.start_at_utc = k.start_at_utc
                """,
                (mid, keep_id),
            )

            cur.execute(
                "UPDATE screening SET film_id = %s WHERE film_id = %s",
                (keep_id, mid),
            )

            # 2) Handle stg_screening (no uniqueness to worry about here)
            cur.execute(
                "UPDATE stg_screening SET film_id = %s WHERE film_id = %s",
                (keep_id, mid),
            )

            # 3) Handle film_person
            cur.execute(
                """
                INSERT INTO film_person (film_id, person_id, role)
                SELECT %s, person_id, role
                FROM film_person
                WHERE film_id = %s
                ON CONFLICT (film_id, person_id, role) DO NOTHING
                """,
                (keep_id, mid),
            )

            cur.execute(
                "DELETE FROM film_person WHERE film_id = %s",
                (mid,),
            )

            # 4) Delete the losing film row itself
            cur.execute("DELETE FROM film WHERE id = %s", (mid,))

    print(f"  {prefix}Group merged into film ID {keep_id}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    dry_run = "--dry-run" in sys.argv

    if not MANUAL_MERGES:
        print("No MANUAL_MERGES defined. Edit MANUAL_MERGES in this script first.")
        sys.exit(0)

    if dry_run:
        print("=" * 60)
        print("DRY RUN MODE - No changes will be made to the database")
        print("=" * 60)
        print()

    conn = conn_open()
    try:
        total_groups = 0
        total_losers = 0

        for keep_id, losers in MANUAL_MERGES:
            if not losers:
                continue

            # Basic sanity checks
            if keep_id in losers:
                raise ValueError(
                    f"keep_id {keep_id} appears in its own loser list.")

            total_groups += 1
            total_losers += len(losers)

            merge_film_group_manual(conn, keep_id, losers, dry_run)

        if dry_run:
            print("\n" + "=" * 60)
            print("DRY RUN COMPLETE")
            print(f"Groups processed: {total_groups}")
            print(f"Total losing film IDs (across all groups): {total_losers}")
            print("Run without --dry-run to apply changes.")
            print("=" * 60)
        else:
            conn.commit()
            print("\n" + "=" * 60)
            print("SUCCESS: Manual film merges applied")
            print(f"Groups processed: {total_groups}")
            print(f"Total losing film IDs (across all groups): {total_losers}")
            print("=" * 60)

    except Exception as e:
        conn.rollback()
        print("\nERROR during manual merge:", e, file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
