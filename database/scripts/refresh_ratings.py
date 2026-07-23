#!/usr/bin/env python3
"""
Refresh time-sensitive OMDb rating fields for already-enriched films.

WHY THIS IS A SEPARATE SCRIPT (not a run_all.py step):

  omdb_api.py (part of the default run_all.py pipeline) only fetches OMDb
  data for films that have NEVER been enriched (omdb_synced_at IS NULL).
  That's cheap and safe to run on every pipeline invocation, because most
  films only need it once — title, genre, plot, cast don't change.

  Ratings (imdb_rating, imdb_votes, rt_rating_pct) are different: they
  drift over time as more people rate a film. Refreshing them means
  re-querying OMDb for films that already have data, which is comparatively
  expensive (it spends API quota on films that already "work"). Doing that
  automatically on every pipeline run would undo the whole point of the
  omdb_synced_at incremental filter and risk re-triggering the same daily
  quota wall this hardening pass was meant to fix.

  So: this script is standalone, run on its own schedule (e.g. a weekly
  cron), separate from run_all.py's ALL_STEPS. It is NOT wired into
  run_all.py on purpose — see run_all.py's module docstring for a pointer
  here, so this doesn't get lost/forgotten.

Only rt_rating_pct / imdb_rating / imdb_votes + omdb_synced_at are updated.
Static fields (genre, plot, cast, ...) are left untouched — use
`omdb_api.py --all` if those need a full re-fetch instead.

Usage:
    python scripts/refresh_ratings.py                  # films unrefreshed for 30+ days, oldest first
    python scripts/refresh_ratings.py --days 14         # custom staleness window
    python scripts/refresh_ratings.py --limit 100       # cap how many films to touch this run
    python scripts/refresh_ratings.py --dry-run         # list what would be refreshed; no API calls, no writes

Env:
  - OMDB_API_KEY in database/.env
  - DATABASE_URL in database/.env (used by db_helper.conn_open)
"""

import argparse
import sys
from typing import Any, Dict

from db_helper import conn_open, fetch_films_for_rating_refresh
from omdb_api import (
    OmdbQuotaExceeded,
    _mark_no_omdb_match,
    _write_with_reconnect,
    fetch_omdb_data,
    parse_imdb_rating,
    parse_imdb_votes,
    parse_rt_percent,
)
from log_setup import get_logger

log = get_logger("refresh_ratings")

DEFAULT_STALE_AFTER_DAYS = 30


def _write_rating_refresh(conn, film_id: int, omdb_data: Dict[str, Any]) -> None:
    """Update only the time-sensitive rating fields + omdb_synced_at.
    Deliberately does NOT touch genre/plot/cast/etc — those are static and
    already handled by omdb_api.py's one-time enrichment."""
    rt_pct = parse_rt_percent(omdb_data)
    imdb_rating = parse_imdb_rating(omdb_data)
    imdb_votes = parse_imdb_votes(omdb_data)
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE film SET
                rt_rating_pct = %s,
                imdb_rating = %s,
                imdb_votes = %s,
                omdb_synced_at = NOW()
            WHERE id = %s
            """,
            (rt_pct, imdb_rating, imdb_votes, film_id),
        )


def main():
    parser = argparse.ArgumentParser(
        description="Refresh imdb_rating / imdb_votes / rt_rating_pct for already-enriched films"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_STALE_AFTER_DAYS,
        help=f"Only refresh films last synced more than N days ago (default: {DEFAULT_STALE_AFTER_DAYS})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap how many films to refresh this run (oldest-synced first). "
             "Recommended for large catalogs to bound OMDb quota usage.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List which films would be refreshed without calling OMDb or writing to the DB.",
    )
    args = parser.parse_args(sys.argv[1:])

    conn = conn_open()
    try:
        films = fetch_films_for_rating_refresh(
            conn, stale_after_days=args.days, limit=args.limit)
        log.info(
            f"{len(films)} film(s) last synced more than {args.days} day(s) ago"
            + (f" (capped at {args.limit})" if args.limit else "")
        )

        if args.dry_run:
            # Plain print(), not logging: this is the actual answer to the
            # --dry-run query (a listing to read/skim/pipe), not an
            # operational log record — keeping it on stdout, undecorated,
            # matches how most CLIs separate "requested output" from "logs"
            # (which go to stderr here). See log_setup.py's docstring.
            for film in films:
                print(
                    f"  would refresh: {film['title']} ({film.get('year') or ''}) "
                    f"— last synced {film['omdb_synced_at']}"
                )
            return

        refreshed, missed = 0, 0
        reconnects = [0]  # 1-element out-param counter, shared with _write_with_reconnect
        omdb_stats = {"http_429": 0, "http_4xx": 0,
                       "http_5xx": 0, "request_exc": 0}
        quota_exceeded_at = None

        for idx, film in enumerate(films):
            try:
                omdb_data = fetch_omdb_data(film, omdb_stats)
            except OmdbQuotaExceeded as e:
                log.warning(
                    f"[OMDb] Daily request limit reached ({e}); stopping early "
                    f"instead of burning through the remaining {len(films) - idx} films."
                )
                quota_exceeded_at = idx
                break

            if not omdb_data:
                # Transient failure (network/4xx after retries) — leave
                # omdb_synced_at untouched so this film is retried on the
                # very next refresh_ratings run, not just the next staleness
                # window.
                log.warning(
                    f"[MISS] {film['title']} ({film.get('year') or ''}) — no OMDb data this time")
                missed += 1
                continue

            if omdb_data.get("Response") == "False":
                # Definitive "no such title" answer from OMDb. We still stamp
                # omdb_synced_at here — same as omdb_api.py's
                # _mark_no_omdb_match — so this film rejoins the staleness
                # queue in --days days instead of being re-picked (and
                # re-spending quota) on every single refresh run. It isn't
                # "given up on forever": OMDb's catalog can change, so it
                # gets one more shot each refresh cycle, just not every run.
                log.info(
                    f"[MISS] {film['title']} ({film.get('year') or ''}) — no OMDb data this time")
                conn, _ = _write_with_reconnect(
                    conn,
                    lambda c: _mark_no_omdb_match(c, film["id"]),
                    label=film["title"],
                    reconnects=reconnects,
                )
                missed += 1
                continue

            conn, write_ok = _write_with_reconnect(
                conn,
                lambda c: _write_rating_refresh(c, film["id"], omdb_data),
                label=film["title"],
                reconnects=reconnects,
            )
            if not write_ok:
                missed += 1
                continue

            rt = parse_rt_percent(omdb_data)
            ir = parse_imdb_rating(omdb_data)
            iv = parse_imdb_votes(omdb_data)
            log.info(
                f"[OK] {film['title']} ({film.get('year') or ''})  "
                f"RT%={rt if rt is not None else '-'}  "
                f"IMDb={ir if ir is not None else '-'} ({iv if iv is not None else '-'})"
            )
            refreshed += 1

        log.info(f"Done. Refreshed: {refreshed}  |  Missed: {missed}")
        if quota_exceeded_at is not None:
            log.warning(
                f"Stopped early at film {quota_exceeded_at + 1}/{len(films)} "
                f"due to OMDb daily quota; re-run later to continue."
            )
        if reconnects[0]:
            log.info(f"DB reconnected {reconnects[0]} time(s) mid-run")
        log.info(
            f"OMDb API summary — HTTP 429: {omdb_stats['http_429']}  |  "
            f"4xx (other): {omdb_stats['http_4xx']}  |  "
            f"5xx: {omdb_stats['http_5xx']}  |  "
            f"request errors: {omdb_stats['request_exc']}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
