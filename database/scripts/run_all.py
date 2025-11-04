#!/usr/bin/env python3
"""
run_all.py

Utility script to run a sequence of loader/lookup scripts in the
`database/scripts/` folder in a predictable order. Intended to make it easy to
run the ETL steps with one command instead of invoking each script manually.

Supported steps (default order):
    - load_json
    - resolve_imdb_id_url
    - omdb_api

Options:
    --steps LOAD1,LOAD2   Comma-separated list of steps to run (see supported
                                                steps). You can also include `merge` to run the
                                                promotion SQL.
    --merge               Shortcut to append the `merge` step (promotes
                                                staging -> live). This is intentionally opt-in and
                                                should only be used after validating staging data.
    --stop-on-error       Stop on first failing step (recommended with merge).

Important safety note:
    The `merge` step executes `database/etl/merge_staging_to_live.sql` and
    promotes staged screening rows into the live `screening` table. This is a
    potentially destructive/production-changing action. The runner requires an
    explicit `--merge` flag (or `merge` in `--steps`) to run it; by default the
    merge is NOT executed.

Usage examples:
        python run_all.py
        python run_all.py --steps load_json,resolve_imdb_id_url
        python run_all.py --merge --stop-on-error

This script imports each module and calls its `main()` function. It adds the
scripts directory to `sys.path` so sibling imports work regardless of the
current working directory.

Notes:
    - This is intentionally lightweight: it does not refactor project layout.
    - If you prefer the scripts to be moved into a subpackage, we can refactor
        them into a package and update imports; this helper will keep the same
        public API (calling `main()`).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import List
import argparse

SCRIPT_DIR = Path(__file__).resolve().parent
# Ensure this scripts directory is first on sys.path so sibling imports work
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


def import_and_run(module_name: str) -> None:
    """Import a module by name and call its main() function.

    Raises an exception if import or execution fails.
    """
    import importlib

    mod = importlib.import_module(module_name)
    if not hasattr(mod, "main"):
        raise RuntimeError(f"Module {module_name!r} has no main() function")
    # Prefer calling main([]) so that imported modules don't pick up this
    # runner's command-line arguments (e.g. --merge). If the module's main
    # doesn't accept an argv parameter, fall back to calling it without args.
    # Ensure imported modules don't see this runner's CLI args. Some modules
    # accept an argv parameter, others read sys.argv directly; handle both.
    old_argv = sys.argv
    sys.argv = [module_name]
    try:
        try:
            mod.main([])
        except TypeError:
            mod.main()
    finally:
        sys.argv = old_argv


def parse_steps(raw: str | None) -> List[str]:
    if not raw:
        return ["load_json", "resolve_imdb_id_url", "omdb_api"]
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    # allow short names
    normalized = []
    for p in parts:
        if p in {"all", "*"}:
            return ["load_json", "resolve_imdb_id_url", "omdb_api"]
        if p == "load_json":
            normalized.append("load_json")
        elif p in {"resolve_imdb", "resolve_imdb_id_url"}:
            normalized.append("resolve_imdb_id_url")
        elif p in {"omdb", "omdb_api"}:
            normalized.append("omdb_api")
        elif p in {"merge"}:
            normalized.append("merge")
        else:
            raise ValueError(f"Unknown step: {p}")
    return normalized


def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run loader and lookup scripts in sequence (load_json -> resolve_imdb -> omdb)")
    parser.add_argument(
        "--steps",
        help=(
            "Comma-separated steps to run. Available: load_json, resolve_imdb, omdb. "
            "Default: all"
        ),
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop if any step raises an exception (default: continue and report errors)",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Run the final staging->live merge SQL after other steps (dangerous: promotes staging to live). Off by default.",
    )
    args = parser.parse_args(argv)

    try:
        steps = parse_steps(args.steps)
    except ValueError as e:
        print(f"Error: {e}")
        parser.print_help()
        sys.exit(2)

    # If user requested --merge and merge not already in steps, append it at the end
    if args.merge and "merge" not in steps:
        steps.append("merge")

    print("Running steps:")
    for s in steps:
        print(f"  - {s}")

    results = []
    for step in steps:
        print(f"\n=== Starting step: {step} ===")
        start = time.time()
        try:
            if step == "merge":
                # execute the merge SQL script (requires explicit --merge)
                from pathlib import Path
                from db_helper import conn_open

                sql_path = Path(__file__).resolve(
                ).parents[1] / "etl" / "merge_staging_to_live.sql"
                # run the SQL file

                def run_merge(sql_file: Path):
                    print(f"Running merge SQL: {sql_file}")
                    sql_text = sql_file.read_text(encoding="utf-8")
                    conn = conn_open()
                    try:
                        with conn.cursor() as cur:
                            # naive split on ';' to execute statements sequentially
                            # the merge script itself controls transactions
                            for stmt in [s.strip() for s in sql_text.split(";") if s.strip()]:
                                cur.execute(stmt)
                        conn.commit()
                    except Exception:
                        conn.rollback()
                        raise
                    finally:
                        conn.close()

                run_merge(sql_path)
            else:
                import_and_run(step)
            elapsed = time.time() - start
            print(f"=== Completed {step} in {elapsed:.1f}s ===")
            results.append((step, "ok", None))
        except Exception as e:  # noqa: BLE001 - we want to capture any exception
            elapsed = time.time() - start
            print(f"!!! Step {step} failed after {elapsed:.1f}s: {e}")
            results.append((step, "error", str(e)))
            if args.stop_on_error:
                break

    print("\nSummary:")
    for step, status, info in results:
        if status == "ok":
            print(f"  {step}: OK")
        else:
            print(f"  {step}: ERROR - {info}")

    # Return non-zero exit code if there were errors
    if any(r[1] == "error" for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
