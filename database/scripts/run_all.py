#!/usr/bin/env python3
"""
run_all.py

Utility script to run the data enrichment pipeline in a predictable order.

TWO KINDS OF "MERGE":
  • merge-persons      → deduplicate rows in `person`
                         - default: DRY RUN (no changes)
                         - use --force to actually merge
  • merge-screenings   → promote `stg_screening` → `screening`
                         - default: APPLY changes
                         - use --merge-dry-run to preview only

STEPS (hyphenated names):
  1) load-json               Load scraped movie screening data into staging
  2) resolve-imdb-id-url     Fetch TMDB/IMDB IDs for films
  3) omdb-api                Fetch detailed film metadata and create person records
  4) enrich-person-ids       Fetch TMDB/IMDB IDs for persons
  5) merge-persons           Merge duplicate person records
  6) merge-screenings        Promote staging data to live screening table

DEFAULT (no flags):
  python run_all.py

  Runs the FULL pipeline in this order:
    load-json → resolve-imdb-id-url → omdb-api → enrich-person-ids
    → merge-persons (DRY RUN)
    → merge-screenings (APPLY)

COMMON USE CASES:

  # 1) Full pipeline (recommended during normal use)
  python run_all.py

  # 2) Full pipeline, but do NOT write anything to live screening table
  #    (both merges run, but merge-screenings is dry-run)
  python run_all.py --merge-dry-run

  # 3) Only the first 4 enrichment steps (no merges at all)
  python run_all.py --no-merge

  # 4) Only promote staging → live (apply)
  python run_all.py --steps merge-screenings

  # 5) Only promote staging → live (dry-run)
  python run_all.py --steps merge-screenings --merge-dry-run

  # 6) Preview person dedup only (safe)
  python run_all.py --steps merge-persons

  # 7) Apply person dedup only
  python run_all.py --steps merge-persons --force

  # 8) Custom subset, e.g. just re-load JSON and re-merge screenings
  python run_all.py --steps load-json,merge-screenings
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
# Mapping & parsing utilities
# ----------------------------

# User-facing (hyphenated) → internal module/function (underscored)
HY_STEP_TO_INTERNAL = {
    "load-json": "load_json",
    "resolve-imdb-id-url": "resolve_imdb_id_url",
    "omdb-api": "omdb_api",
    "enrich-person-ids": "enrich_person_ids",
    "merge-persons": "merge_duplicate_persons",
    # merge-screenings → merge_staging_to_live.main(...)
    "merge-screenings": "merge_screenings",
}

# Back-compat / aliases accepted in --steps
ALIASES = {
    # "all" = full pipeline including merges
    "all": [
        "load-json",
        "resolve-imdb-id-url",
        "omdb-api",
        "enrich-person-ids",
        "merge-persons",
        "merge-screenings",
    ],

    "load": ["load-json"],
    "load_json": ["load-json"],

    "resolve-imdb": ["resolve-imdb-id-url"],
    "tmdb": ["resolve-imdb-id-url"],
    "resolve_imdb_id_url": ["resolve-imdb-id-url"],

    "omdb": ["omdb-api"],
    "omdb_api": ["omdb-api"],

    "enrich_person_ids": ["enrich-person-ids"],
    "person-ids": ["enrich-person-ids"],

    # Merges
    "merge-persons": ["merge-persons"],
    "merge_persons": ["merge-persons"],
    "merge_people": ["merge-persons"],
    "dedup_persons": ["merge-persons"],

    "merge-screenings": ["merge-screenings"],
    "merge_screenings": ["merge-screenings"],
    "merge": ["merge-screenings"],  # short alias → screenings
}

# Default = FULL pipeline
DEFAULT_HY_STEPS = ALIASES["all"]


def _canon_token(tok: str) -> str:
    """Normalize tokens: lower, strip, convert underscores→hyphens."""
    return tok.strip().lower().replace("_", "-")


def parse_steps(raw: str | None) -> List[str]:
    """Return a list of hyphenated step names."""
    if not raw:
        return DEFAULT_HY_STEPS.copy()

    hy_tokens = [_canon_token(p) for p in raw.split(",") if p.strip()]
    out: List[str] = []
    for t in hy_tokens:
        if t in ALIASES:
            out.extend(ALIASES[t])
        elif t in HY_STEP_TO_INTERNAL:
            out.append(t)
        else:
            raise ValueError(f"Unknown step: {t}")

    # de-duplicate preserving order
    seen = set()
    ordered = []
    for s in out:
        if s not in seen:
            seen.add(s)
            ordered.append(s)
    return ordered


def ensure_merge_order(hy_steps: List[str]) -> List[str]:
    """Guarantee merge-persons runs before merge-screenings if both present."""
    if "merge-persons" in hy_steps and "merge-screenings" in hy_steps:
        first_idx = min(
            hy_steps.index("merge-persons"),
            hy_steps.index("merge-screenings"),
        )
        others = [s for s in hy_steps if s not in {
            "merge-persons", "merge-screenings"}]
        prefix = others[:first_idx]
        suffix = others[first_idx:]
        return prefix + ["merge-persons", "merge-screenings"] + suffix
    return hy_steps


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
            # some modules accept argv
            mod.main([])
        except TypeError:
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
            "Comma-separated steps (hyphenated). Available: "
            "load-json, resolve-imdb-id-url, omdb-api, enrich-person-ids, "
            "merge-persons, merge-screenings. "
            "Default (no --steps): run FULL pipeline (all steps)."
        ),
    )
    parser.add_argument(
        "--no-merge",
        action="store_true",
        help="Skip BOTH merge-persons and merge-screenings, even if they are in the default/steps.",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop if any step fails",
    )
    parser.add_argument(
        "--merge-dry-run",
        action="store_true",
        help="Run merge-screenings in dry-run mode (preview; no changes).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="For merge-persons: actually merge (default: dry run).",
    )
    args = parser.parse_args(argv)

    # 1) Which steps to run?
    try:
        steps_hy = parse_steps(args.steps)
    except ValueError as e:
        print(f"Error: {e}")
        parser.print_help()
        sys.exit(2)

    # 2) Optionally drop all merge steps
    if args.no_merge:
        steps_hy = [s for s in steps_hy if s not in {
            "merge-persons", "merge-screenings"}]

    # 3) Enforce merge order if both present
    steps_hy = ensure_merge_order(steps_hy)

    print("=" * 60)
    print("Data Enrichment Pipeline")
    print("=" * 60)
    print("Running steps (hyphenated):")
    for s in steps_hy:
        print(f"  - {s}")
    if "merge-persons" in steps_hy and not args.force:
        print("\nNOTE: merge-persons will run in DRY RUN mode (use --force to apply).")
    if "merge-screenings" in steps_hy and args.merge_dry_run:
        print("NOTE: merge-screenings will run in DRY RUN mode (no changes).")
    print()

    results = []

    for step_hy in steps_hy:
        step_internal = HY_STEP_TO_INTERNAL[step_hy]
        print(f"\n{'=' * 60}\nStarting step: {step_hy}\n{'=' * 60}")
        start = time.time()

        try:
            if step_hy == "merge-persons":
                # merge_duplicate_persons.py
                extra = [] if args.force else ["--dry-run"]
                import_and_run("merge_duplicate_persons", extra)

            elif step_hy == "merge-screenings":
                # merge_staging_to_live.py
                extra = ["--dry-run"] if args.merge_dry_run else []
                import_and_run("merge_staging_to_live", extra)

            else:
                # normal steps (module names match internal identifiers)
                import_and_run(step_internal)

            elapsed = time.time() - start
            print(f"✅ Completed {step_hy} in {elapsed:.1f}s")
            results.append((step_hy, "ok", None))

        except Exception as e:
            elapsed = time.time() - start
            print(f"❌ Step {step_hy} failed after {elapsed:.1f}s: {e}")
            results.append((step_hy, "error", str(e)))
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
