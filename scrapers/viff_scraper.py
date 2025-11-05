import json
import time
import random
import os
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError


def scrape_viff_listings():

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        })

        results = []
        page_num = 1
        max_pages = 50

        print("=== PHASE 1: Scraping Listing Pages ===")
        print("Collecting basic info and detail URLs...")

        while page_num <= max_pages:
            url = f"https://viff.org/whats-on/page/{page_num}/"
            print(f"\nScraping page {page_num}: {url}")

            try:
                page.goto(url, timeout=60000)
            except Exception as e:
                print(f"Failed to load page {page_num}: {e}")
                break

            delay = random.uniform(2.0, 4.0)
            time.sleep(delay)

            try:
                page.wait_for_selector(".c-event-card", timeout=10000)
            except TimeoutError:
                print(
                    f"No event cards found or page {page_num} does not exist. Stopping.")
                break

            cards = page.query_selector_all(".c-event-card")
            if not cards:
                print("No cards found. Stopping.")
                break

            print(f"Found {len(cards)} events on page {page_num}")

            for i, card in enumerate(cards):
                try:
                    if i > 0:
                        time.sleep(random.uniform(0.3, 0.8))

                    # Initialize event with all fields as null
                    event = {
                        "title": None,
                        "director": None,
                        "year": None,
                        "duration": None,
                        "detail_url": None,
                        "showtimes": []
                    }

                    # Extract title
                    title_el = card.query_selector(".c-event-card__title")
                    if title_el:
                        title_text = title_el.inner_text().strip()
                        if title_text:
                            event["title"] = title_text

                    # Skip if no title
                    if not event["title"]:
                        continue

                    # Extract director
                    director_el = card.query_selector(
                        ".c-event-card__subtitle")
                    if director_el:
                        director_text = director_el.inner_text().strip()
                        if director_text:
                            event["director"] = director_text

                    # Extract duration
                    duration_el = card.query_selector(
                        ".c-event-card__duration")
                    if duration_el:
                        duration_text = duration_el.inner_text().strip()
                        if duration_text:
                            event["duration"] = duration_text

                    # Extract detail URL
                    detail_url_el = card.query_selector(
                        ".c-event-card__button.c-btn.c-btn--tertiary")
                    if detail_url_el:
                        href = detail_url_el.get_attribute("href")
                        if href:
                            event["detail_url"] = href

                    # Extract showtimes
                    instance_els = card.query_selector_all(".c-event-instance")
                    for inst in instance_els:
                        time_el = inst.query_selector(
                            ".c-event-instance__time")
                        date_el = inst.query_selector(
                            ".c-event-instance__date span")
                        venue_el = inst.query_selector(
                            ".c-event-instance__venue-info")

                        showtime = {}

                        if date_el:
                            date_text = date_el.inner_text().strip()
                            if date_text:
                                showtime["date"] = date_text

                        if time_el:
                            time_text = time_el.inner_text().strip()
                            if time_text:
                                showtime["time"] = time_text

                        if venue_el:
                            venue_text = venue_el.inner_text().strip()
                            if venue_text:
                                showtime["venue"] = venue_text

                        if showtime:  # Add if any field was set
                            event["showtimes"].append(showtime)

                    results.append(event)

                    # Log what was found
                    found_fields = [f"title={event['title']}"]
                    if event.get("director"):
                        found_fields.append(f"director")
                    if event.get("duration"):
                        found_fields.append(f"duration")
                    found_fields.append(f"{len(event['showtimes'])} showtimes")

                    print(f"    {i+1}/{len(cards)}: {', '.join(found_fields)}")

                except Exception as e:
                    print(f"    Error processing card {i+1}: {e}")
                    continue

            page_num += 1
            print(f"Page {page_num - 1} complete. Total events: {len(results)}")

        browser.close()

        os.makedirs("data", exist_ok=True)
        with open("data/viff_listings_only.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print(
            f"\nPhase 1 complete! Scraped {len(results)} events from {page_num - 1} pages")
        print("Saved basic info to: data/viff_listings_only.json")

        return results


def scrape_viff_details(events_data):

    print(f"\n=== PHASE 2: Scraping Detail Pages ===")

    events_with_urls = [e for e in events_data if e.get("detail_url")]

    print(f"Processing {len(events_with_urls)} events with detail URLs...")

    if not events_with_urls:
        print("No events have detail URLs to process.")
        return events_data

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        })

        for i, event in enumerate(events_with_urls):
            detail_url = event["detail_url"]

            try:
                print(
                    f"    {i+1}/{len(events_with_urls)}: Getting details for {event['title']}")

                page.goto(detail_url, timeout=30000)
                time.sleep(random.uniform(1.5, 3.0))

                # Extract year
                try:
                    year_title = page.query_selector(
                        'div.c-event__details-title:has-text("Year")')
                    if year_title:
                        year_el = year_title.query_selector(
                            '+ .c-event__details-details')
                        if year_el:
                            year_text = year_el.inner_text().strip()
                            if year_text:
                                event["year"] = year_text
                                print(f"        ✓ Found year: {year_text}")

                except Exception as e:
                    print(f"        ⚠ Error extracting year: {e}")

            except Exception as e:
                print(
                    f"        ✗ Error getting details for {event['title']}: {e}")
                continue

        browser.close()
        print(
            f"\n✓ Phase 2 complete! Processed details for {len(events_with_urls)} events")

        return events_data


def scrape_viff_complete():
    try:
        events = scrape_viff_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return []

        complete_events = scrape_viff_details(events)

        os.makedirs("data", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        timestamped_filename = f"data/viff_screenings_{timestamp}.json"
        with open(timestamped_filename, "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        events_with_director = len(
            [e for e in complete_events if e.get("director")])
        events_with_year = len([e for e in complete_events if e.get("year")])
        events_with_duration = len(
            [e for e in complete_events if e.get("duration")])
        events_with_url = len(
            [e for e in complete_events if e.get("detail_url")])
        total_showtimes = sum(len(e.get('showtimes', []))
                              for e in complete_events)

        print(f"\n{'='*50}")
        print(f"🎬 VIFF Scraping Complete! 🎬")
        print(f"Total events: {len(complete_events)}")
        print(f"Events with director: {events_with_director}")
        print(f"Events with year: {events_with_year}")
        print(f"Events with duration: {events_with_duration}")
        print(f"Events with detail URL: {events_with_url}")
        print(f"Total showtimes: {total_showtimes}")
        print(f"Saved to: {timestamped_filename}")

        return complete_events

    except KeyboardInterrupt:
        print("\nScraping interrupted by user. Check data folder for partial results.")
        return []
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return []


if __name__ == "__main__":
    scrape_viff_complete()
