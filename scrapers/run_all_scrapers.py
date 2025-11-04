#!/usr/bin/env python3
# not fully tested
"""
Run all scrapers sequentially with a single command.

Usage:
  python run_all_scrapers.py
  python run_all_scrapers.py --continue-on-error
"""

import argparse
import subprocess
import sys
from pathlib import Path
from datetime import datetime


def run(script_path: Path) -> int:
    print(
        f"\n=== [{datetime.now().isoformat(timespec='seconds')}] Running: {script_path} ===")
    if not script_path.exists():
        print(f"✗ Not found: {script_path}")
        return 127
    # Use the same Python interpreter we’re running with
    proc = subprocess.run([sys.executable, str(
        script_path)], cwd=str(script_path.parent))
    rc = proc.returncode
    print(f"--- Exit code: {rc} ({'OK' if rc == 0 else 'ERROR'})")
    return rc


def main():
    ap = argparse.ArgumentParser(description="Run all scrapers")
    ap.add_argument("--continue-on-error", action="store_true",
                    help="Run remaining scrapers even if one fails")
    args = ap.parse_args()

    # Adjust these paths to where your scrapers live.
    # If this runner sits at repo root, these examples assume:
    #   ./scripts/cine_scraper.py, ./scripts/viff_scraper.py, ./scripts/rio_scraper.py
    # Replace with your actual locations if different.
    root = Path(__file__).resolve().parent
    candidates = [
        root / "cine_scraper.py",
        root / "viff_scraper.py",
        root / "rio_scraper.py",
    ]

    # If your scrapers are elsewhere, e.g. database/scripts/, use:
    # root = Path(__file__).resolve().parent
    # candidates = [
    #     root / "database" / "scripts" / "cine_scraper.py",
    #     root / "database" / "scripts" / "viff_scraper.py",
    #     root / "database" / "scripts" / "rio_scraper.py",
    # ]

    order = candidates  # run in this order
    results = []
    for script in order:
        rc = run(script)
        results.append((script.name, rc))
        if rc != 0 and not args.continue_on_error:
            print("\nStopping due to error. Use --continue-on-error to run all.")
            break

    # Summary
    print("\n=== Summary ===")
    for name, rc in results:
        print(f"{name}: {'OK' if rc == 0 else f'ERROR ({rc})'}")
    failed = [r for r in results if r[1] != 0]
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
