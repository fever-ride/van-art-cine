#!/usr/bin/env python3
"""
run_all.py

Utility script to run the data enrichment pipeline in a predictable order.

TERMS (two kinds of "merge"):
  • merge-persons      → deduplicate rows in `person` (safe by default: dry run; use --force to apply)
  • merge-screenings   → promote `stg_screening` → `screening` (apply by default; use --merge-dry-run to preview)

AVAILABLE STEPS (use hyphenated names):
  1) load-json               Load scraped movie screening data into staging
  2) resolve-imdb-id-url     Fetch TMDB/IMDB IDs for films
  3) omdb-api                Fetch detailed film metadata and create person records
  4) enrich-person-ids       Fetch TMDB/IMDB IDs for persons
  5) merge-persons           Merge duplicate person records (requires --force to actually merge)
  6) merge-screenings        Promote staging data to live screening table

FLAGS:
  --steps X,Y,...            Run only these steps (comma-separated, hyphenated). Use 'all' for steps 1–4.
  --merge-screenings         Append the merge-screenings step to whatever steps are running.
  --merge-dry-run            Make merge-screenings a dry run (preview; no changes).
  --force                    For merge-persons: actually merge (default: dry run).
  --stop-on-error            Stop immediately if any step fails.

DEFAULT RUN (no --steps):
  load-json → resolve-imdb-id-url → omdb-api → enrich-person-ids

ORDERING RULE:
  If both merges are present, the pipeline enforces:
    merge-persons  →  merge-screenings
  even if the user lists them in the opposite order.

COMMON RECIPES:
  # Default pipeline (no merges)
  python run_all.py

  # Default pipeline + promote to live (apply)
  python run_all.py --merge-screenings

  # Default pipeline + promote to live (dry-run)
  python run_all.py --merge-screenings --merge-dry-run

  # Only promote to live (apply)
  python run_all.py --steps merge-screenings

  # Only promote to live (dry-run)
  python run_all.py --steps merge-screenings --merge-dry-run

  # Preview person dedup only (safe)
  python run_all.py --steps merge-persons

  # Apply person dedup only
  python run_all.py --steps merge-persons --force

  # Full pipeline: default 4 → dedup persons (apply) → promote to live (apply)
  python run_all.py --steps all,merge-persons --force --merge-screenings --stop-on-error
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
    # runner branch calls merge_staging_to_live
    "merge-screenings": "merge_screenings",
}

# Back-compat / aliases accepted in --steps (underscores, short forms, etc.)
ALIASES = {
    "all": ["load-json", "resolve-imdb-id-url", "omdb-api", "enrich-person-ids"],

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
    "merge": ["merge-screenings"],  # old ambiguous alias → screenings
}

DEFAULT_HY_STEPS = ALIASES["all"]  # the 4 default steps


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
        # Remove both; reinsert in the correct order at the position of the first encountered merge.
        first_idx = min(hy_steps.index("merge-persons"),
                        hy_steps.index("merge-screenings"))
        others = [s for s in hy_steps if s not in {
            "merge-persons", "merge-screenings"}]
        # Split others around the insertion point
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
            mod.main([])  # some modules accept argv
        except TypeError:
            mod.main()
    finally:
        sys.argv = old_argv


# ----------------------------
# Main
# ----------------------------

def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run data enrichment pipeline")
    parser.add_argument(
        "--steps",
        help=("Comma-separated steps (hyphenated). Available: "
              "load-json, resolve-imdb-id-url, omdb-api, enrich-person-ids, "
              "merge-persons, merge-screenings. "
              "Default: the first four (no merges)."),
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop if any step fails",
    )
    parser.add_argument(
        "--merge-screenings",
        action="store_true",
        help="Append merge-screenings after other steps",
    )
    parser.add_argument(
        "--merge-dry-run",
        action="store_true",
        help="Run merge-screenings in dry-run mode (preview; no changes)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="For merge-persons: actually merge (default: dry run)",
    )
    args = parser.parse_args(argv)

    try:
        steps_hy = parse_steps(args.steps)
    except ValueError as e:
        print(f"Error: {e}")
        parser.print_help()
        sys.exit(2)

    # optionally append screenings merge
    if args.merge_screenings and "merge-screenings" not in steps_hy:
        steps_hy.append("merge-screenings")

    # enforce merge order if both present
    steps_hy = ensure_merge_order(steps_hy)

    print("=" * 60)
    print("Data Enrichment Pipeline")
    print("=" * 60)
    print("Running steps (hyphenated):")
    for s in steps_hy:
        print(f"  - {s}")
    if "merge-persons" in steps_hy and not args.force:
        print("\nNOTE: merge-persons will run in DRY RUN mode (use --force to apply)")
    if "merge-screenings" in steps_hy and args.merge_dry_run:
        print("NOTE: merge-screenings will run in DRY RUN mode")
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
