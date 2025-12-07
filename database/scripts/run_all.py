#!/usr/bin/env python3
"""
Utility script to run the data loading and enrichment pipeline.

MERGES:
  • merge_duplicate_films    → deduplicate rows in `film`
  • merge_duplicate_persons  → deduplicate rows in `person`
  • merge_staging_to_live    → promote `stg_screening` → `screening`

Merge steps:
  - Default: APPLY changes
  - With --dry-run on this script: pass --dry-run down to merge_* scripts
    so they only log what they would do (no DB changes).

ALL STEPS (step name == module name without .py):
  1) load_json               Load scraped movie screening data into staging
  2) resolve_imdb_id_url     Fetch TMDB/IMDB IDs for films
  3) merge_duplicate_films   Merge duplicate film records
  4) omdb_api                Fetch detailed film metadata and create person records
  5) enrich_person_ids       Fetch TMDB/IMDB IDs for persons
  6) merge_duplicate_persons Merge duplicate person records
  7) merge_staging_to_live   Promote staging data to live screening table

DEFAULT (no flags):
  python run_all.py

  Runs the FULL pipeline in this order:
    load_json → resolve_imdb_id_url → merge_duplicate_films
    → omdb_api → enrich_person_ids
    → merge_duplicate_persons → merge_staging_to_live

COMMON USE CASES:

  # 1) Full pipeline (all steps, merges APPLY)
  python run_all.py

  # 2) Full pipeline, but run ALL merge steps in DRY RUN mode
  #    (merge_duplicate_films, merge_duplicate_persons, merge_staging_to_live
  #     all run with --dry-run)
  #
  #    WARNING:
  #      Dry-run merges execute inside their own transaction and roll back
  #      afterwards. This means they do NOT leave any changes for subsequent
  #      pipeline steps. The rest of the pipeline (load_json, resolve_imdb_id_url,
  #      omdb_api, enrich_person_ids) *does* write normally.
  #
  #      As a result, this mode previews the merge logic correctly, but it is
  #      NOT a faithful simulation of the full end-to-end pipeline, because
  #      later steps will see the pre-merge database state.
  #
  #    Use this mode only when you want to inspect merge behavior without
  #    applying it to the database.
  python run_all.py --dry-run

  # 3) Only the first 4 enrichment steps (no merges at all)
  python run_all.py --no-merge

  # 4) Only promote staging → live (apply)
  python run_all.py --steps merge_staging_to_live

  # 5) Only promote staging → live (dry-run)
  python run_all.py --steps merge_staging_to_live --dry-run

  # 6) Preview person dedup only (dry-run)
  python run_all.py --steps merge_duplicate_persons --dry-run

  # 7) Apply person dedup only
  python run_all.py --steps merge_duplicate_persons

  # 8) Custom subset, e.g. just re-load JSON and re-merge screenings
  python run_all.py --steps load_json,merge_staging_to_live
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

# ----------------------------
# Step configuration
# ----------------------------

# Step names are exactly the module filenames without .py
ALL_STEPS: List[str] = [
    "load_json",
    "resolve_imdb_id_url",
    "merge_duplicate_films",
    "omdb_api",
    "enrich_person_ids",
    "merge_duplicate_persons",
    "merge_staging_to_live",
]

MERGE_STEPS = {
    "merge_duplicate_films",
    "merge_duplicate_persons",
    "merge_staging_to_live",
}

DEFAULT_STEPS = ALL_STEPS.copy()


def parse_steps(raw: str | None) -> List[str]:
    """
    Parse --steps into a list of step names.

    Step names must exactly match module filenames without .py,
    e.g. 'load_json', 'merge_staging_to_live'.
    """
    if not raw:
        return DEFAULT_STEPS.copy()

    tokens = [p.strip() for p in raw.split(",") if p.strip()]
    if not tokens:
        return DEFAULT_STEPS.copy()

    for t in tokens:
        if t not in ALL_STEPS:
            raise ValueError(f"Unknown step: {t}")

    # de-duplicate while preserving order
    seen = set()
    ordered: List[str] = []
    for s in tokens:
        if s not in seen:
            seen.add(s)
            ordered.append(s)
    return ordered


def ensure_merge_order(steps: List[str]) -> List[str]:
    """
    Guarantee merge_duplicate_persons runs before merge_staging_to_live
    if both are present.
    """
    if "merge_duplicate_persons" in steps and "merge_staging_to_live" in steps:
        first_idx = min(
            steps.index("merge_duplicate_persons"),
            steps.index("merge_staging_to_live"),
        )
        others = [
            s for s in steps
            if s not in {"merge_duplicate_persons", "merge_staging_to_live"}
        ]
        prefix = others[:first_idx]
        suffix = others[first_idx:]
        return prefix + ["merge_duplicate_persons", "merge_staging_to_live"] + suffix
    return steps


# ----------------------------
# Runner helpers
# ----------------------------

def import_and_run(module_name: str, extra_args: List[str] | None = None) -> None:
    """Import a module by name and call its main() function."""
    import importlib

    mod = importlib.import_module(module_name)
    if not hasattr(mod, "main"):
        raise RuntimeError(f"Module {module_name!r} has no main() function")

    old_argv = sys.argv
    sys.argv = [module_name] + (extra_args or [])
    try:
        try:
            # some modules accept argv (e.g. main(argv))
            mod.main([])
        except TypeError:
            # others expect no arguments
            mod.main()
    finally:
        sys.argv = old_argv


# ----------------------------
# Main
# ----------------------------

def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run data enrichment pipeline"
    )
    parser.add_argument(
        "--steps",
        help=(
            "Comma-separated step names (must match module filenames without .py). "
            "Available: " + ", ".join(ALL_STEPS) + ". "
            "Default (no --steps): run FULL pipeline (all steps)."
        ),
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Skip ALL merge steps (merge_duplicate_films, merge_duplicate_persons, "
             "merge_staging_to_live), even if they are in the default/steps.",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop if any step fails.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run merge steps in DRY RUN mode (pass --dry-run to merge scripts).",
    )
    args = parser.parse_args(argv)

    # 1) Which steps to run?
    try:
        steps = parse_steps(args.steps)
    except ValueError as e:
        print(f"Error: {e}")
        parser.print_help()
        sys.exit(2)

    # 2) Optionally drop all merge steps
    if args.no_merge:
        steps = [s for s in steps if s not in MERGE_STEPS]

    # 3) Enforce merge order if both present
    steps = ensure_merge_order(steps)

    print("=" * 60)
    print("Data Enrichment Pipeline")
    print("=" * 60)
    print("Running steps:")
    for s in steps:
        print(f"  - {s}")
    if args.dry_run and any(s in MERGE_STEPS for s in steps):
        print("\nNOTE: merge steps will run in DRY RUN mode (no changes).")
    print()

    results = []

    for step in steps:
        print(f"\n{'=' * 60}\nStarting step: {step}\n{'=' * 60}")
        start = time.time()

        try:
            # Merge steps: pass through --dry-run when requested
            if step in MERGE_STEPS:
                extra = ["--dry-run"] if args.dry_run else []
                import_and_run(step, extra)
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
                print("\nStopping due to --stop-on-error")
                break

    print(f"\n{'=' * 60}\nSummary\n{'=' * 60}")
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
