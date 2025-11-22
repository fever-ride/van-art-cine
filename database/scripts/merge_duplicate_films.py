#!/usr/bin/env python3
"""
Merge duplicate film records in the database (PostgreSQL).

Strategy (high-level):
  1) Identify duplicate film groups by external IDs:
       - Step 1: duplicates by imdb_id
       - Step 2: duplicates by tmdb_id
     (Title-based merging is intentionally NOT included here because titles
      are noisy; we only merge when we have strong external IDs.)

  2) For each duplicate group, choose a single "canonical" film record to keep:
       - Prefer films with more external IDs (imdb_id, tmdb_id)
       - Prefer films with more metadata filled in (year, ratings, votes, URLs, etc.)
       - Prefer films with more references (screening, stg_screening, film_person)
       - Prefer films with earlier created_at
       - Prefer films with smaller id as final tiebreaker

  3) Re-point foreign-key references from the losing films to the kept film:
       - screening.film_id
       - stg_screening.film_id
       - film_person.film_id
     and deduplicate where unique constraints exist.

  4) Delete the merged-away film rows.

Usage:
    python scripts/merge_duplicate_films.py [--dry-run]

Notes:
  - This script is explicitly aware of all tables that reference film.id:
      * screening.film_id
      * stg_screening.film_id
      * film_person.film_id
    If new relations are added in the future, they MUST be handled here
    to avoid leaving references pointing at deleted film IDs.

  - For screening:
      * There is a UNIQUE constraint on (cinema_id, film_id, start_at_utc).
        When re-pointing screenings from a loser film_id to the kept one,
        we may create duplicates that violate this unique constraint.
        To avoid this, we proactively delete exact-duplicate screenings
        before updating the film_id.

  - For film_person:
      * The primary key is (film_id, person_id, role).
        We use INSERT ... ON CONFLICT DO NOTHING to deduplicate rows when
        merging references into the kept film, then delete leftover rows
        for the losers.
"""

import sys
from typing import List, Tuple, Dict, Any
from db_helper import conn_open


# ---------------------------------------------------------------------------
# Duplicate group discovery
# ---------------------------------------------------------------------------

def find_film_duplicates_by_field(conn, field: str) -> List[Tuple[Any, List[int]]]:
    """
    Return a list of (field_value, [film_ids]) where field_value is duplicated.

    field must be one of:
      - 'imdb_id' (text)
      - 'tmdb_id' (int)
    """

    if field not in {"imdb_id", "tmdb_id"}:
        raise ValueError(f"Unsupported field for film dedup: {field}")

    # Build Postgres-safe non-empty predicate per type
    if field == "tmdb_id":
        where_nonempty = f"{field} IS NOT NULL"
    else:
        # TEXT: exclude empty strings too
        where_nonempty = f"{field} IS NOT NULL AND {field} <> ''"

    sql = f"""
        SELECT {field},
               array_agg(id ORDER BY id) AS ids,
               COUNT(*) AS cnt
        FROM film
        WHERE {where_nonempty}
        GROUP BY {field}
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
    """

    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    out: List[Tuple[Any, List[int]]] = []
    for field_value, ids_array, cnt in rows:
        out.append((field_value, [int(x) for x in ids_array]))
    return out


# ---------------------------------------------------------------------------
# Film details / reference counts
# ---------------------------------------------------------------------------

def get_film_details(conn, film_id: int) -> Dict[str, Any]:
    """
    Fetch core details for a film. If not found, returns {}.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id,
                   title,
                   year,
                   rated,
                   genre,
                   language,
                   country,
                   awards,
                   rt_rating_pct,
                   imdb_rating,
                   imdb_votes,
                   description,
                   normalized_title,
                   imdb_id,
                   tmdb_id,
                   imdb_url,
                   tags,
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
        "rated": row[3],
        "genre": row[4],
        "language": row[5],
        "country": row[6],
        "awards": row[7],
        "rt_rating_pct": row[8],
        "imdb_rating": row[9],
        "imdb_votes": row[10],
        "description": row[11],
        "normalized_title": row[12],
        "imdb_id": row[13],
        "tmdb_id": row[14],
        "imdb_url": row[15],
        "tags": row[16],
        "created_at": row[17],
    }


def count_film_references(conn, film_id: int) -> Dict[str, int]:
    """
    Count how many references a film has across key tables.

    Returns a dict with keys:
      - screening_count
      - stg_screening_count
      - film_person_count
      - total (sum of the above)
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
# Scoring: choose canonical film per duplicate group
# ---------------------------------------------------------------------------

def metadata_score(rec: Dict[str, Any]) -> int:
    """
    Rough measure of how much metadata is filled in for this film.
    This is intentionally simple; you can adjust fields/weights later.
    """
    score = 0

    # Basic numeric / text fields
    if rec.get("year") is not None:
        score += 1
    if rec.get("rated"):
        score += 1
    if rec.get("genre"):
        score += 1
    if rec.get("language"):
        score += 1
    if rec.get("country"):
        score += 1
    if rec.get("awards"):
        score += 1

    # Ratings / votes
    if rec.get("rt_rating_pct") is not None:
        score += 1
    if rec.get("imdb_rating") is not None:
        score += 1
    if rec.get("imdb_votes") is not None:
        score += 1

    # Richer text fields
    if rec.get("description"):
        score += 1
    if rec.get("normalized_title"):
        score += 1

    # External URL
    if rec.get("imdb_url"):
        score += 1

    # Tags
    tags = rec.get("tags") or []
    if isinstance(tags, (list, tuple)) and len(tags) > 0:
        score += 1

    return score


def choose_best_film_record(conn, film_ids: List[int]) -> int:
    """
    Choose the best film record to keep from a group of duplicate IDs.

    Scoring strategy:
      1) More external IDs (imdb_id, tmdb_id) is better
      2) More metadata fields filled in is better
      3) More references (screening + stg_screening + film_person) is better
      4) Earlier created_at is better
      5) Smaller id is better (as final tiebreaker)
    """

    records: List[Dict[str, Any]] = []
    for fid in film_ids:
        details = get_film_details(conn, fid)
        # If a film was already deleted earlier in this run, skip it
        if not details:
            continue
        ref_counts = count_film_references(conn, fid)
        details["ref_counts"] = ref_counts
        records.append(details)

    if not records:
        # Fallback: if everything is gone (should not usually happen),
        # just return the first id; caller should handle empty details.
        return film_ids[0]

    def score(rec: Dict[str, Any]):
        id_count = int(bool(rec.get("imdb_id"))) + \
            int(bool(rec.get("tmdb_id")))
        meta = metadata_score(rec)
        ref_total = rec.get("ref_counts", {}).get("total", 0)
        created_at = rec.get("created_at")
        ts = created_at.timestamp() if created_at else float("inf")
        return (
            id_count,   # more external IDs is better
            meta,       # more metadata fields filled is better
            ref_total,  # more references is better
            -ts,        # earlier created_at is better
            -rec["id"],  # smaller id is better (reverse for descending)
        )

    best = sorted(records, key=score, reverse=True)[0]
    return best["id"]


# ---------------------------------------------------------------------------
# Merge logic for a duplicate group
# ---------------------------------------------------------------------------

def merge_film_group(conn, keep_id: int, merge_ids: List[int], dry_run: bool = False) -> None:
    """
    Merge a group of duplicate films into a single kept film (keep_id).

    Steps:
      1) Log summary of what will be merged.
      2) For each losing film_id in merge_ids:
           - log counts and details
           - if not dry-run:
               * move screening references, deduplicating potential conflicts
               * move stg_screening references
               * move film_person references with ON CONFLICT DO NOTHING
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
            print(f"  {prefix}Film ID {mid} already missing; skipping.")
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
                # Already deleted or not found
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

            # 2) Handle stg_screening: no uniqueness on (cinema_id, film_id, start_at_utc)
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
    if dry_run:
        print("=" * 60)
        print("DRY RUN MODE - No changes will be made to the database")
        print("=" * 60)
        print()

    conn = conn_open()
    try:
        total_merged = 0
        # Track IDs that have already been processed as part of a group
        # so we do not re-merge them across steps (imdb_id → tmdb_id).
        seen_ids = set()

        # Step 1: merge by imdb_id
        print("=" * 60)
        print("Step 1: Finding duplicate films by imdb_id...")
        print("=" * 60)
        imdb_dupes = find_film_duplicates_by_field(conn, "imdb_id")
        print(f"Found {len(imdb_dupes)} duplicate groups by imdb_id")

        for imdb_val, ids in imdb_dupes:
            remaining_ids = [fid for fid in ids if fid not in seen_ids]
            if len(remaining_ids) <= 1:
                continue

            keep = choose_best_film_record(conn, remaining_ids)
            merge_ids = [x for x in remaining_ids if x != keep]
            merge_film_group(conn, keep, merge_ids, dry_run)
            total_merged += len(merge_ids)

            for fid in remaining_ids:
                seen_ids.add(fid)

        # Step 2: merge by tmdb_id
        print("\n" + "=" * 60)
        print("Step 2: Finding duplicate films by tmdb_id...")
        print("=" * 60)
        tmdb_dupes = find_film_duplicates_by_field(conn, "tmdb_id")
        print(f"Found {len(tmdb_dupes)} duplicate groups by tmdb_id")

        for tmdb_val, ids in tmdb_dupes:
            remaining_ids = [fid for fid in ids if fid not in seen_ids]
            if len(remaining_ids) <= 1:
                continue

            keep = choose_best_film_record(conn, remaining_ids)
            merge_ids = [x for x in remaining_ids if x != keep]
            merge_film_group(conn, keep, merge_ids, dry_run)
            total_merged += len(merge_ids)

            for fid in remaining_ids:
                seen_ids.add(fid)

        if dry_run:
            print("\n" + "=" * 60)
            print("DRY RUN COMPLETE")
            print(f"Would merge {total_merged} duplicate film records")
            print("Run without --dry-run to apply changes")
            print("=" * 60)
        else:
            conn.commit()
            print("\n" + "=" * 60)
            print(f"SUCCESS: Merged {total_merged} duplicate film records")
            print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
