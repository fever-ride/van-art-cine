import json
import sys
import time
import random
import os
import re
from datetime import datetime, timedelta, timezone

import requests
from bs4 import BeautifulSoup

from extraction_health import check_extraction_health


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
# project_root/data/test
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "latest")

BASE_URL = "https://riotheatre.ca"
LISTINGS_API = f"{BASE_URL}/wp-json/barker/v1/listings"

# How far ahead to pull showtimes. The calendar page's own "next" arrow
# doesn't paginate a fixed dataset -- it just re-requests this same API with
# a shifted start_date/end_date window, so there's no "give me everything"
# call; we pick how far out we want directly. 6 weeks checked against the
# real catalog (2026-10-11): 39 unique films vs. 29 at the old 4-week
# default, with diminishing returns further out (8 weeks only added 4 more).
WINDOW_WEEKS = 6

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def scrape_rio_listings():
    """Phase 1: fetch showtimes directly from Rio's own public listings API
    instead of rendering the calendar page in a browser and scraping the
    resulting DOM.

    Found by watching the calendar page's own network requests while
    clicking its "next" arrow: the page's JS calls exactly this endpoint
    (`wp-json/barker/v1/listings`, a public, unauthenticated WordPress REST
    route from the site's "Barker Events" plugin) to build what it renders.
    Calling it directly skips the browser entirely for this phase -- no
    Playwright, no waiting for the calendar's JS to run, no CSS selectors
    to break if Rio redesigns the calendar's markup.
    """
    print("=== PHASE 1: Fetching Rio Theatre listings API ===")

    now = datetime.now(timezone.utc)
    start = now
    end = now + timedelta(weeks=WINDOW_WEEKS)

    params = {
        "start_date": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "end_date": end.strftime("%Y-%m-%dT%H:%M:%S.999Z"),
        "page": 1,
        "per_page": 500,
        "status": "publish",
    }
    print(f"Window: {params['start_date']} -> {params['end_date']}")

    try:
        resp = requests.get(LISTINGS_API, params=params,
                             headers=HEADERS, timeout=30)
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        print(f"✗ Failed to fetch listings API: {e}")
        return []

    if not isinstance(rows, list):
        print(f"✗ Unexpected response shape (expected a list): {type(rows).__name__}")
        return []

    print(f"✓ Fetched {len(rows)} showtimes from the API")

    unique_events = {}
    for row in rows:
        event = row.get("event") or {}
        title = (event.get("title") or "").strip()
        start_time = row.get("start_time")

        if not title or not start_time:
            continue

        # A human-readable fallback is kept in "time" purely so
        # load_json.py's load_source(), shared by all three scraped
        # sources, doesn't skip this row on its "missing date/time" guard
        # -- the actual parsing (load_json.py's parse_dt_rio) uses the ISO
        # string in "date" directly and ignores this field.
        try:
            time_label = datetime.fromisoformat(start_time).strftime("%I:%M%p").lstrip("0").lower()
        except ValueError:
            time_label = "unknown"

        showtime = {
            "date": start_time,
            "time": time_label,
            "venue": "Rio Theatre",
        }

        if title in unique_events:
            unique_events[title]["showtimes"].append(showtime)
        else:
            unique_events[title] = {
                "title": title,
                "director": None,
                "year": None,
                "duration": None,
                "detail_url": event.get("link"),
                "imdb_url": None,
                "showtimes": [showtime],
            }

    results = list(unique_events.values())
    print(f"✓ Phase 1 complete")
    print(f"Unique events found: {len(results)}")
    print(f"Total showtimes: {len(rows)}")

    return results


def scrape_rio_details(events_data):
    """Phase 2: fetch each movie's own page with a plain HTTP request and
    parse the HTML with BeautifulSoup, instead of clicking into it with
    Playwright.

    Confirmed these detail pages are fully server-rendered before reaching
    for this: fetched a page with no JS execution at all (no browser) and
    the runtime/IMDb link were already present in that raw response, so a
    browser was never actually required to "finish" building them, only to
    read the finished result.

    Selectors: `.barker-movie-details__row--<field>` wrapping a nested
    `.barker-movie-details__value` -- genre/director/country/language/rated
    are also available this way via a dedicated REST endpoint
    (`wp-json/wp/v2/barker_movie/<id>`), but deliberately not captured here:
    OMDb already supplies them (and ratings/synopsis/awards, which Rio's own
    page never has), so adding a second source for the same fields would
    just be unused complexity. Runtime and release year are NOT in that
    REST endpoint at all (confirmed: empty on every film checked, including
    ones the live page clearly displays both for) -- WordPress custom post
    meta, unlike the taxonomy-based fields, isn't exposed over REST unless a
    developer explicitly opts it in, and Barker didn't for these two. Only
    the rendered HTML has them.

    Rio changed this markup at some point from the previous
    `.movie-event-sidebar-info-item.<field>` scheme without anyone noticing
    -- that selector now matches zero elements site-wide, silently (no
    error, just permanently-empty director/runtime/year going forward from
    whenever the change happened). See scrape_rio_complete()'s sanity check
    for how a future repeat of this is meant to actually get noticed.
    """
    print(f"\n=== PHASE 2: Fetching detail pages ===")

    events_with_urls = [e for e in events_data if e.get("detail_url")]
    print(f"Processing {len(events_with_urls)} events with detail URLs...")

    for i, event in enumerate(events_with_urls):
        detail_url = event["detail_url"]
        print(f"\n  {i + 1}/{len(events_with_urls)}: Fetching '{event['title']}'...")

        try:
            resp = requests.get(detail_url, headers=HEADERS, timeout=20)
            resp.raise_for_status()
        except Exception as e:
            print(f"    ✗ Failed to fetch detail page: {e}")
            time.sleep(random.uniform(0.3, 0.8))
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        def detail_field(modifier: str):
            row = soup.select_one(
                f".barker-movie-details__row--{modifier} .barker-movie-details__value"
            )
            if not row:
                return None
            text = row.get_text(strip=True)
            return text or None

        year_text = detail_field("release-year")
        if year_text and year_text.isdigit() and len(year_text) == 4:
            event["year"] = year_text

        runtime_text = detail_field("runtime")
        runtime_match = re.search(r"(\d+)", runtime_text or "")
        if runtime_match:
            event["duration"] = f"{runtime_match.group(1)} mins"

        director_text = detail_field("director")
        if director_text:
            event["director"] = director_text

        imdb_el = soup.select_one('a[href*="imdb.com/title/"]')
        if imdb_el and imdb_el.get("href"):
            event["imdb_url"] = imdb_el["href"]

        found_fields = [
            f"{k}={event[k]}"
            for k in ("year", "duration", "director", "imdb_url")
            if event.get(k)
        ]
        if found_fields:
            print(f"    ✓ Extracted: {', '.join(found_fields)}")
        else:
            print(f"    ⚠ No details found on detail page")

        time.sleep(random.uniform(0.3, 0.8))

    print(f"\n✓ Phase 2 complete!")
    return events_data


def scrape_rio_complete():
    """Complete Rio Theatre scraping: fetch listings, then get details.

    Returns (events, quality_ok) -- quality_ok is False when extraction
    looks broken (see extraction_health.py), even though events is still
    the real (degraded) data, which the caller still saves and hands to
    enrichment: a quality problem shouldn't also throw away the data that
    *did* come through.
    """
    try:
        events = scrape_rio_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return [], False

        complete_events = scrape_rio_details(events)

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"rio_screenings_{timestamp}.json"
        output_path = os.path.join(OUTPUT_DIR, filename)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        events_with_director = len(
            [e for e in complete_events if e.get("director")])
        events_with_year = len([e for e in complete_events if e.get("year")])
        events_with_duration = len(
            [e for e in complete_events if e.get("duration")])
        events_with_url = len(
            [e for e in complete_events if e.get("detail_url")])
        events_with_imdb = len(
            [e for e in complete_events if e.get("imdb_url")])
        total_showtimes = sum(len(e.get('showtimes', []))
                              for e in complete_events)

        print(f"\n{'='*50}")
        print(f"🎬 Rio Theatre Scraping Complete! 🎬")
        print(f"Total unique events: {len(complete_events)}")
        print(f"Events with director: {events_with_director}")
        print(f"Events with year: {events_with_year}")
        print(f"Events with duration: {events_with_duration}")
        print(f"Events with detail URL: {events_with_url}")
        print(f"Events with IMDb URL: {events_with_imdb}")
        print(f"Total showtimes: {total_showtimes}")
        print(f"Saved to: {output_path}")

        # Sanity check against a repeat of exactly the bug that motivated
        # this rewrite: Rio's detail-page markup changed once already,
        # silently taking director/runtime/year to zero with no error from
        # anything, for about two months, before anyone noticed (confirmed
        # against this project's own historical scrape snapshots). This is
        # what makes the process actually exit non-zero now, not just print
        # a warning -- see extraction_health.py for why 0.15.
        ok, rate, message = check_extraction_health(complete_events, "director")
        if not ok:
            print(f"\n⚠️  WARNING: {message}")

        return complete_events, ok

    except KeyboardInterrupt:
        print("\nScraping interrupted by user. Check data folder for partial results.")
        return [], False
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return [], False


if __name__ == "__main__":
    # Non-zero exit on either an empty result or a suspiciously-low
    # extraction rate, so the caller (run_all_scrapers.py, then the GitHub
    # Actions job's "Fail job if scrapers failed" step) can actually detect
    # both -- previously this only caught "zero events," so a scrape that
    # returned real events with silently-broken detail extraction looked
    # identical to a fully healthy run.
    events, quality_ok = scrape_rio_complete()
    sys.exit(0 if (events and quality_ok) else 1)
