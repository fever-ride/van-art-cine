#!/usr/bin/env python3
"""
Merge duplicate person records in the database.

This script:
1. Finds duplicate persons by:
   - Same imdb_id (most reliable)
   - Same tmdb_id
   - Same normalized_name
2. Chooses the best record to keep (most complete data, earliest created)
3. Updates all film_person references to point to the kept record
4. Deletes duplicate records

Usage:
    python scripts/merge_duplicate_persons.py [--dry-run]
    
    --dry-run: Preview changes without modifying database
"""

import sys
from typing import List, Tuple, Dict
from db_helper import conn_open


def find_duplicates_by_field(conn, field: str) -> List[Tuple]:
    """
    Find persons with duplicate values in a specific field.

    Args:
        conn: Database connection
        field: Field name ('imdb_id', 'tmdb_id', or 'normalized_name')

    Returns:
        List of (field_value, [person_ids]) tuples
    """
    with conn.cursor() as cursor:
        cursor.execute(f"""
            SELECT {field}, GROUP_CONCAT(id ORDER BY id) as ids, COUNT(*) as cnt
            FROM person 
            WHERE {field} IS NOT NULL AND {field} != ''
            GROUP BY {field}
            HAVING cnt > 1
            ORDER BY cnt DESC
        """)
        results = cursor.fetchall()

    duplicates = []
    for field_value, ids_str, count in results:
        ids = [int(x) for x in ids_str.split(',')]
        duplicates.append((field_value, ids))

    return duplicates


def get_person_details(conn, person_id: int) -> Dict:
    """Get full details of a person record."""
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT id, name, imdb_id, tmdb_id, normalized_name, created_at
            FROM person 
            WHERE id = %s
        """, (person_id,))
        row = cursor.fetchone()

        if not row:
            return {}

        return {
            'id': row[0],
            'name': row[1],
            'imdb_id': row[2],
            'tmdb_id': row[3],
            'normalized_name': row[4],
            'created_at': row[5],
        }


def count_film_references(conn, person_id: int) -> int:
    """Count how many film_person records reference this person."""
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT COUNT(*) FROM film_person WHERE person_id = %s
        """, (person_id,))
        return cursor.fetchone()[0]


def choose_best_record(conn, person_ids: List[int]) -> int:
    """
    Choose which person record to keep based on:
    1. Has most external IDs (imdb_id and/or tmdb_id)
    2. Most film references
    3. Earliest created_at
    4. Smallest ID (tiebreaker)

    Returns: person_id to keep
    """
    records = []
    for pid in person_ids:
        details = get_person_details(conn, pid)
        ref_count = count_film_references(conn, pid)
        details['ref_count'] = ref_count
        records.append(details)

    def score(record):
        # Count external IDs
        id_count = sum([
            1 if record.get('imdb_id') else 0,
            1 if record.get('tmdb_id') else 0,
        ])

        # Get timestamp (earlier is better, so negate)
        timestamp = record.get('created_at').timestamp(
        ) if record.get('created_at') else 0

        # More IDs is better, more refs is better, earlier is better, smaller id is better
        return (
            id_count,           # Higher is better
            record['ref_count'],  # Higher is better
            -timestamp,         # Earlier is better (negated)
            -record['id']       # Smaller is better (negated)
        )

    # Sort by score (descending) and pick the best
    sorted_records = sorted(records, key=score, reverse=True)
    return sorted_records[0]['id']


def merge_persons(conn, keep_id: int, merge_ids: List[int], dry_run: bool = False):
    """
    Merge duplicate person records into one.

    Args:
        conn: Database connection
        keep_id: ID of the record to keep
        merge_ids: IDs of records to merge into keep_id
        dry_run: If True, only print what would be done
    """
    keep_details = get_person_details(conn, keep_id)

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n{prefix}Merging into: {keep_details['name']} (ID: {keep_id})")
    print(f"  IMDB: {keep_details.get('imdb_id') or 'None'}")
    print(f"  TMDB: {keep_details.get('tmdb_id') or 'None'}")
    print(f"  Normalized: {keep_details.get('normalized_name')}")

    total_refs = 0

    for merge_id in merge_ids:
        merge_details = get_person_details(conn, merge_id)
        ref_count = count_film_references(conn, merge_id)
        total_refs += ref_count

        print(
            f"  {prefix}Merging: {merge_details['name']} (ID: {merge_id}) - {ref_count} film references")

        if not dry_run:
            with conn.cursor() as cursor:
                # Update film_person references
                # Use INSERT IGNORE with SELECT to handle duplicate key conflicts
                cursor.execute("""
                    INSERT IGNORE INTO film_person (film_id, person_id, role)
                    SELECT film_id, %s, role 
                    FROM film_person 
                    WHERE person_id = %s
                """, (keep_id, merge_id))

                # Delete old film_person records
                cursor.execute("""
                    DELETE FROM film_person WHERE person_id = %s
                """, (merge_id,))

                # Delete the merged person record
                cursor.execute("DELETE FROM person WHERE id = %s", (merge_id,))

    print(f"  {prefix}Total references to merge: {total_refs}")

    # Update keep record with best available data from all records
    if not dry_run:
        all_ids = [keep_id] + merge_ids
        with conn.cursor() as cursor:
            # Find best values across all duplicate records
            placeholders = ','.join(['%s'] * len(all_ids))
            cursor.execute(f"""
                SELECT 
                    MAX(CASE WHEN imdb_id IS NOT NULL AND imdb_id != '' THEN imdb_id END) as best_imdb,
                    MAX(CASE WHEN tmdb_id IS NOT NULL THEN tmdb_id END) as best_tmdb
                FROM person 
                WHERE id IN ({placeholders})
            """, all_ids)

            result = cursor.fetchone()
            best_imdb = result[0] if result else None
            best_tmdb = result[1] if result else None

            # Update keep record if we found better values
            updates = []
            if best_imdb and not keep_details.get('imdb_id'):
                cursor.execute(
                    "UPDATE person SET imdb_id = %s WHERE id = %s", (best_imdb, keep_id))
                print(f"  Updated IMDB ID: {best_imdb}")
                updates.append(f"IMDB: {best_imdb}")

            if best_tmdb and not keep_details.get('tmdb_id'):
                cursor.execute(
                    "UPDATE person SET tmdb_id = %s WHERE id = %s", (best_tmdb, keep_id))
                print(f"  Updated TMDB ID: {best_tmdb}")
                updates.append(f"TMDB: {best_tmdb}")

            if updates:
                print(f"  Enhanced kept record with: {', '.join(updates)}")


def main():
    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print("="*60)
        print("DRY RUN MODE - No changes will be made to the database")
        print("="*60)
        print()

    conn = conn_open()

    try:
        total_merged = 0

        # 1. Find and merge duplicates by IMDB ID
        print("=" * 60)
        print("Step 1: Finding duplicates by IMDB ID...")
        print("=" * 60)
        imdb_dupes = find_duplicates_by_field(conn, 'imdb_id')
        print(f"Found {len(imdb_dupes)} groups of IMDB duplicates")

        for imdb_id, person_ids in imdb_dupes:
            keep_id = choose_best_record(conn, person_ids)
            merge_ids = [pid for pid in person_ids if pid != keep_id]
            merge_persons(conn, keep_id, merge_ids, dry_run)
            total_merged += len(merge_ids)

        # 2. Find and merge duplicates by TMDB ID
        print("\n" + "=" * 60)
        print("Step 2: Finding duplicates by TMDB ID...")
        print("=" * 60)
        tmdb_dupes = find_duplicates_by_field(conn, 'tmdb_id')
        print(f"Found {len(tmdb_dupes)} groups of TMDB duplicates")

        for tmdb_id, person_ids in tmdb_dupes:
            keep_id = choose_best_record(conn, person_ids)
            merge_ids = [pid for pid in person_ids if pid != keep_id]
            merge_persons(conn, keep_id, merge_ids, dry_run)
            total_merged += len(merge_ids)

        # 3. Find and merge duplicates by normalized_name
        print("\n" + "=" * 60)
        print("Step 3: Finding duplicates by normalized_name...")
        print("=" * 60)
        name_dupes = find_duplicates_by_field(conn, 'normalized_name')
        print(f"Found {len(name_dupes)} groups of name duplicates")

        for norm_name, person_ids in name_dupes:
            keep_id = choose_best_record(conn, person_ids)
            merge_ids = [pid for pid in person_ids if pid != keep_id]
            merge_persons(conn, keep_id, merge_ids, dry_run)
            total_merged += len(merge_ids)

        # Commit or rollback
        if not dry_run:
            conn.commit()
            print("\n" + "=" * 60)
            print(f"✅ SUCCESS: Merged {total_merged} duplicate person records")
            print("=" * 60)
        else:
            print("\n" + "=" * 60)
            print(f"✅ DRY RUN COMPLETE")
            print(f"Would merge {total_merged} duplicate person records")
            print("Run without --dry-run to apply changes")
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
