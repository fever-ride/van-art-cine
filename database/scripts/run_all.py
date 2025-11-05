#!/usr/bin/env python3
"""
run_all.py

Utility script to run the data enrichment pipeline in a predictable order.

AVAILABLE STEPS:
    1. load_json           - Load scraped movie screening data into staging
    2. resolve_imdb_id_url - Fetch TMDB/IMDB IDs for films
    3. omdb_api            - Fetch detailed film metadata and create person records
    4. enrich_person_ids   - Fetch TMDB/IMDB IDs for persons
    5. merge_persons       - Merge duplicate person records (requires --force to actually merge)
    6. merge               - Promote staging data to live screening table

OPTIONS:
    --steps STEP1,STEP2   Run specific steps (comma-separated)
                          Use 'all' for steps 1-4 (default if no --steps specified)
                          
    --force               Actually merge duplicates in merge_persons step
                          (without this, merge_persons runs in --dry-run mode)
                          
    --merge               APPEND the 'merge' step to whatever steps are running
                          WARNING: This is NOT the same as --steps merge
                          
    --stop-on-error       Stop immediately if any step fails

TYPICAL WORKFLOW:

    # Step 1: Run the main enrichment pipeline (steps 1-4)
    python run_all.py
    
    # Step 2: Preview duplicate merging (dry-run, safe)
    python run_all.py --steps merge_persons
    
    # Step 3: Actually merge duplicates
    python run_all.py --steps merge_persons --force
    
    # Step 4: Promote staging to live screening table
    python run_all.py --steps merge
    
    # OR run everything at once (steps 1-6):
    python run_all.py --steps all,merge_persons --force --merge

COMMON USAGE EXAMPLES:

    # Run default pipeline (load + enrich films + enrich persons)
    python run_all.py
    
    # Only load new data
    python run_all.py --steps load_json
    
    # Re-enrich persons without reloading
    python run_all.py --steps enrich_person_ids
    
    # Preview what merge_persons would do (dry-run)
    python run_all.py --steps merge_persons
    
    # Actually merge duplicate persons
    python run_all.py --steps merge_persons --force
    
    # Only promote staging to live
    python run_all.py --steps merge
    
    # Run full pipeline including merge (with safety stop-on-error)
    python run_all.py --steps all,merge_persons --force --merge --stop-on-error

IMPORTANT NOTES:
    - Default run (no --steps): runs load_json → resolve_imdb_id_url → omdb_api → enrich_person_ids
    - merge_persons is NOT included by default (must explicitly add to --steps)
    - merge_persons uses --dry-run by default; add --force to actually merge
    - merge step is NOT included by default (use --steps merge or --merge flag)
    - --merge flag APPENDS merge to other steps (use --steps merge to run ONLY merge)
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import List
import argparse

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


def import_and_run(module_name: str, extra_args: List[str] = None) -> None:
    """Import a module by name and call its main() function."""
    import importlib

    mod = importlib.import_module(module_name)
    if not hasattr(mod, "main"):
        raise RuntimeError(f"Module {module_name!r} has no main() function")

    old_argv = sys.argv
    sys.argv = [module_name] + (extra_args or [])
    try:
        try:
            mod.main([])
        except TypeError:
            mod.main()
    finally:
        sys.argv = old_argv


def parse_steps(raw: str | None) -> List[str]:
    if not raw:
        return ["load_json", "resolve_imdb_id_url", "omdb_api", "enrich_person_ids"]

    parts = [p.strip() for p in raw.split(",") if p.strip()]
    normalized = []

    for p in parts:
        if p in {"all", "*"}:
            return ["load_json", "resolve_imdb_id_url", "omdb_api", "enrich_person_ids"]
        elif p in {"load_json", "load"}:
            normalized.append("load_json")
        elif p in {"resolve_imdb_id_url", "resolve_imdb", "tmdb"}:
            normalized.append("resolve_imdb_id_url")
        elif p in {"omdb_api", "omdb"}:
            normalized.append("omdb_api")
        elif p in {"enrich_person_ids", "enrich_persons", "person_ids"}:
            normalized.append("enrich_person_ids")
        elif p in {"merge_persons", "merge_people", "dedup_persons"}:
            normalized.append("merge_duplicate_persons")
        elif p in {"merge"}:
            normalized.append("merge")
        else:
            raise ValueError(f"Unknown step: {p}")

    return normalized


def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run data enrichment pipeline"
    )
    parser.add_argument(
        "--steps",
        help=(
            "Comma-separated steps. Available: "
            "load_json, resolve_imdb_id_url, omdb_api, enrich_person_ids, merge_persons, merge. "
            "Default: all except merge_persons and merge"
        ),
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop if any step fails",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Run staging->live merge after other steps",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="For merge_persons: actually merge (default: dry-run)",
    )
    args = parser.parse_args(argv)

    try:
        steps = parse_steps(args.steps)
    except ValueError as e:
        print(f"Error: {e}")
        parser.print_help()
        sys.exit(2)

    if args.merge and "merge" not in steps:
        steps.append("merge")

    print("="*60)
    print("Data Enrichment Pipeline")
    print("="*60)
    print("Running steps:")
    for s in steps:
        print(f"  - {s}")
    if "merge_duplicate_persons" in steps and not args.force:
        print("\n⚠️  NOTE: merge_persons will run in DRY RUN mode")
        print("   Use --force to actually merge duplicates")
    print()

    results = []

    for step in steps:
        print(f"\n{'='*60}")
        print(f"Starting step: {step}")
        print(f"{'='*60}")
        start = time.time()

        try:
            if step == "merge":
                from pathlib import Path
                from db_helper import conn_open

                sql_path = Path(__file__).resolve(
                ).parents[1] / "etl" / "merge_staging_to_live.sql"

                def run_merge(sql_file: Path):
                    print(f"Running merge SQL: {sql_file}")
                    sql_text = sql_file.read_text(encoding="utf-8")
                    conn = conn_open()
                    try:
                        with conn.cursor() as cur:
                            for stmt in [s.strip() for s in sql_text.split(";") if s.strip()]:
                                cur.execute(stmt)
                        conn.commit()
                        print("✅ Staging data promoted to live")
                    except Exception:
                        conn.rollback()
                        raise
                    finally:
                        conn.close()

                run_merge(sql_path)

            elif step == "merge_duplicate_persons":
                extra_args = [] if args.force else ["--dry-run"]
                import_and_run("merge_duplicate_persons", extra_args)

            else:
                import_and_run(step)

            elapsed = time.time() - start
            print(f"✅ Completed {step} in {elapsed:.1f}s")
            results.append((step, "ok", None))

        except Exception as e:
            elapsed = time.time() - start
            print(f"❌ Step {step} failed after {elapsed:.1f}s: {e}")
            results.append((step, "error", str(e)))

            if args.stop_on_error:
                print("\n⚠️  Stopping due to --stop-on-error")
                break

    print(f"\n{'='*60}")
    print("Summary")
    print(f"{'='*60}")
    for step, status, info in results:
        if status == "ok":
            print(f"  ✅ {step}: OK")
        else:
            print(f"  ❌ {step}: ERROR - {info}")

    if any(r[1] == "error" for r in results):
        print("\n⚠️  Pipeline completed with errors")
        sys.exit(1)
    else:
        print("\n🎉 Pipeline completed successfully!")


if __name__ == "__main__":
    main()
