#!/usr/bin/env python3
"""
Merge duplicate person records in the database (PostgreSQL version).

Strategy:
1) Find duplicate groups by imdb_id, then tmdb_id, then normalized_name
2) Pick a single record to keep (more external IDs > more refs > earlier created_at > smaller id)
3) Repoint film_person rows to the kept record, dedup on conflict
4) Delete merged-away person rows

Usage:
    python scripts/merge_duplicate_persons.py [--dry-run]
"""

# NOTE: Known limitations / future improvements for merge_duplicate_persons
#
# 1) Same group processed multiple times
#    The same logical person can appear as a duplicate group in:
#      - Step 1: imdb_id
#      - Step 2: tmdb_id
#      - Step 3: normalized_name
#    We currently do not track which IDs have already been merged, so some
#    records may be revisited in later steps. This is mostly harmless because
#    inserts use ON CONFLICT DO NOTHING, but it can generate redundant work
#    and noisy logs. A future improvement would be to keep a "seen/merged"
#    set and skip IDs that were already consolidated.
#
# 2) Limited field reconciliation
#    When merging, we only reconcile external IDs (imdb_id, tmdb_id), and we
#    leave other fields (e.g. name, normalized_name) as they are on the
#    chosen "winner" record. In groups where different rows have conflicting
#    or complementary data, we may keep a suboptimal name or other fields.
#    A future improvement is to define a more complete merge strategy for
#    non-ID fields (e.g. preferring longer / non-empty names).
#
# 3) Schema coupling (only film_person references)
#    This script assumes that film_person is the only table referencing
#    person.id. If new relations are added in the schema, they must be
#    included here. A future refactor could centralize all foreign-key updates
#    (or generate them from schema metadata) to reduce this risk.
#
# 4) Performance considerations
#    For large datasets, repeatedly querying per-person (details + ref counts)
#    and re-processing the same logical groups across multiple steps may be
#    slow. If needed, we could:
#      - batch queries to reduce round-trips, and/or
#      - collapse the three passes (imdb_id, tmdb_id, normalized_name) into
#        a single dedup pass with a unified grouping / scoring strategy.

import sys
from typing import List, Tuple, Dict, Any
from db_helper import conn_open


def find_duplicates_by_field(conn, field: str) -> List[Tuple[Any, List[int]]]:
    """
    Return a list of (field_value, [person_ids]) where field_value is duplicated.
    field must be one of: 'imdb_id' (text), 'tmdb_id' (int), 'normalized_name' (text)
    """

    if field not in {"imdb_id", "tmdb_id", "normalized_name"}:
        raise ValueError(f"Unsupported field: {field}")

    # Build Postgres-safe non-empty predicate per type
    if field == "tmdb_id":
        # INT: no '' comparisons
        where_nonempty = f"{field} IS NOT NULL"
    else:
        # TEXT: exclude empty strings too
        where_nonempty = f"{field} IS NOT NULL AND {field} <> ''"

    sql = f"""
        SELECT {field},
               array_agg(id ORDER BY id) AS ids,
               COUNT(*) AS cnt
        FROM person
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


def get_person_details(conn, person_id: int) -> Dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, imdb_id, tmdb_id, normalized_name, created_at
            FROM person
            WHERE id = %s
            """,
            (person_id,),
        )
        row = cur.fetchone()

    if not row:
        return {}

    return {
        "id": row[0],
        "name": row[1],
        "imdb_id": row[2],
        "tmdb_id": row[3],
        "normalized_name": row[4],
        "created_at": row[5],
    }


def count_film_references(conn, person_id: int) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM film_person WHERE person_id = %s", (person_id,))
        return cur.fetchone()[0]


def choose_best_record(conn, person_ids: List[int]) -> int:
    """
    Score:
      1) More external IDs (imdb_id, tmdb_id) is better
      2) More film_person refs is better
      3) Earlier created_at is better
      4) Smaller id is better
    """
    records = []
    for pid in person_ids:
        details = get_person_details(conn, pid)
        details["ref_count"] = count_film_references(conn, pid)
        records.append(details)

    def score(rec):
        id_count = int(bool(rec.get("imdb_id"))) + \
            int(bool(rec.get("tmdb_id")))
        # earlier created_at should sort higher ⇒ use negative timestamp
        ts = rec["created_at"].timestamp() if rec.get(
            "created_at") else float("inf")
        return (
            id_count,               # higher is better
            rec["ref_count"],       # higher is better
            -ts,                    # earlier is better
            -rec["id"],             # smaller id is better
        )

    return sorted(records, key=score, reverse=True)[0]["id"]


def merge_persons(conn, keep_id: int, merge_ids: List[int], dry_run: bool = False):
    keep_details = get_person_details(conn, keep_id)

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n{prefix}Merging into: {keep_details.get('name')} (ID: {keep_id})")
    print(f"  IMDB: {keep_details.get('imdb_id') or 'None'}")
    print(f"  TMDB: {keep_details.get('tmdb_id') or 'None'}")
    print(f"  Normalized: {keep_details.get('normalized_name')}")

    total_refs = 0

    for mid in merge_ids:
        merge_details = get_person_details(conn, mid)
        ref_count = count_film_references(conn, mid)
        total_refs += ref_count

        print(
            f"  {prefix}Merging: {merge_details.get('name')} (ID: {mid}) - {ref_count} film references")

        if dry_run:
            continue

        with conn.cursor() as cur:
            # Copy references to kept person; dedup on PK/unique (film_id, person_id, role)
            cur.execute(
                """
                INSERT INTO film_person (film_id, person_id, role)
                SELECT film_id, %s, role
                FROM film_person
                WHERE person_id = %s
                ON CONFLICT (film_id, person_id, role) DO NOTHING
                """,
                (keep_id, mid),
            )

            # Delete old film_person rows for merged-away person
            cur.execute("DELETE FROM film_person WHERE person_id = %s", (mid,))

            # Delete the duplicate person row itself
            cur.execute("DELETE FROM person WHERE id = %s", (mid,))

    print(f"  {prefix}Total references to merge: {total_refs}")

    # Enhance kept record with best external IDs across the group
    if not dry_run and merge_ids:
        all_ids = [keep_id] + merge_ids
        placeholders = ",".join(["%s"] * len(all_ids))

        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    MAX(CASE WHEN imdb_id IS NOT NULL AND imdb_id <> '' THEN imdb_id END) AS best_imdb,
                    MAX(CASE WHEN tmdb_id IS NOT NULL THEN tmdb_id END) AS best_tmdb
                FROM person
                WHERE id IN ({placeholders})
                """,
                all_ids,
            )
            best_imdb, best_tmdb = cur.fetchone()

            updates = []
            if best_imdb and not keep_details.get("imdb_id"):
                cur.execute(
                    "UPDATE person SET imdb_id = %s WHERE id = %s", (best_imdb, keep_id))
                updates.append(f"IMDB: {best_imdb}")

            if best_tmdb and not keep_details.get("tmdb_id"):
                cur.execute(
                    "UPDATE person SET tmdb_id = %s WHERE id = %s", (best_tmdb, keep_id))
                updates.append(f"TMDB: {best_tmdb}")

            if updates:
                print(f"  Enhanced kept record with: {', '.join(updates)}")


def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("=" * 60)
        print("DRY RUN MODE - No changes will be made to the database")
        print("=" * 60)
        print()

    conn = conn_open()
    try:
        total_merged = 0

        # 1) by imdb_id
        print("=" * 60)
        print("Step 1: Finding duplicates by imdb_id...")
        print("=" * 60)
        imdb_dupes = find_duplicates_by_field(conn, "imdb_id")
        print(f"Found {len(imdb_dupes)} groups")
        for imdb, ids in imdb_dupes:
            keep = choose_best_record(conn, ids)
            merge_ids = [x for x in ids if x != keep]
            merge_persons(conn, keep, merge_ids, dry_run)
            total_merged += len(merge_ids)

        # 2) by tmdb_id
        print("\n" + "=" * 60)
        print("Step 2: Finding duplicates by tmdb_id...")
        print("=" * 60)
        tmdb_dupes = find_duplicates_by_field(conn, "tmdb_id")
        print(f"Found {len(tmdb_dupes)} groups")
        for tmdb, ids in tmdb_dupes:
            keep = choose_best_record(conn, ids)
            merge_ids = [x for x in ids if x != keep]
            merge_persons(conn, keep, merge_ids, dry_run)
            total_merged += len(merge_ids)

        # 3) by normalized_name
        print("\n" + "=" * 60)
        print("Step 3: Finding duplicates by normalized_name...")
        print("=" * 60)
        name_dupes = find_duplicates_by_field(conn, "normalized_name")
        print(f"Found {len(name_dupes)} groups")
        for normname, ids in name_dupes:
            keep = choose_best_record(conn, ids)
            merge_ids = [x for x in ids if x != keep]
            merge_persons(conn, keep, merge_ids, dry_run)
            total_merged += len(merge_ids)

        if dry_run:
            print("\n" + "=" * 60)
            print("✅ DRY RUN COMPLETE")
            print(f"Would merge {total_merged} duplicate person records")
            print("Run without --dry-run to apply changes")
            print("=" * 60)
        else:
            conn.commit()
            print("\n" + "=" * 60)
            print(f"✅ SUCCESS: Merged {total_merged} duplicate person records")
            print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
