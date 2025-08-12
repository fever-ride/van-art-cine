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

        # Set realistic browser headers
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
                print(f"No event cards found or page {page_num} does not exist. Stopping.")
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

                    title_el = card.query_selector(".c-event-card__title")
                    title = title_el.inner_text().strip() if title_el else "No title found"

                    director_el = card.query_selector(".c-event-card__subtitle")
                    director = director_el.inner_text().strip() if director_el else "No director found"

                    duration_el = card.query_selector(".c-event-card__duration")
                    duration = duration_el.inner_text().strip() if duration_el else "No duration found"

                    detail_url_el = card.query_selector(".c-event-card__button.c-btn.c-btn--tertiary")
                    detail_url = detail_url_el.get_attribute("href") if detail_url_el else "No detail url found"

                    instance_els = card.query_selector_all(".c-event-instance")
                    showtimes = []

                    for inst in instance_els:
                        time_el = inst.query_selector(".c-event-instance__time")
                        date_el = inst.query_selector(".c-event-instance__date span")
                        venue_el = inst.query_selector(".c-event-instance__venue-info")

                        time_text = time_el.inner_text().strip() if time_el else "No time"
                        date_text = date_el.inner_text().strip() if date_el else "No date"
                        venue_text = venue_el.inner_text().strip() if venue_el else "No venue"

                        showtimes.append({"date": date_text, "time": time_text, "venue": venue_text})

                    results.append({
                        "title": title,
                        "director": director,
                        "duration": duration,
                        "detail_url": detail_url,
                        "year": "Not scraped yet",  # Will be filled in phase 2
                        "showtimes": showtimes
                    })

                    print(f"    {i+1}/{len(cards)}: {title}")

                except Exception as e:
                    print(f"    Error processing card {i+1}: {e}")
                    continue

            page_num += 1
            print(f"Page {page_num - 1} complete. Total events: {len(results)}")

        browser.close()

        # Save Phase 1 results
        os.makedirs("data", exist_ok=True)
        with open("data/viff_listings_only.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print(f"\nPhase 1 complete! Scraped {len(results)} events from {page_num - 1} pages")
        print("Saved basic info to: data/viff_listings_only.json")

        return results

def scrape_viff_details(events_data):

    print(f"\n=== PHASE 2: Scraping Detail Pages ===")
    print(f"Processing {len(events_data)} events for additional details...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Set realistic browser headers
        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
        })

        for i, event in enumerate(events_data):
            detail_url = event.get("detail_url")

            if not detail_url or detail_url == "No detail url found" or not detail_url.startswith("http"):
                print(f"    {i+1}/{len(events_data)}: Skipping {event['title']} (no valid URL)")
                continue

            try:
                print(f"    {i+1}/{len(events_data)}: Getting details for {event['title']}")

                page.goto(detail_url, timeout=30000)
                time.sleep(random.uniform(1.5, 3.0))

                # Try to extract year/additional details
                year_title = page.query_selector('div.c-event__details-title:has-text("Year")')
                if year_title:
                    year_el = year_title.query_selector('+ .c-event__details-details')
                    year = year_el.inner_text().strip() if year_el else "No year found"

                event["year"] = year

                print(f"        Found year: {year}")

            except Exception as e:
                print(f"        Error getting details for {event['title']}: {e}")
                event["year"] = "Error retrieving year"
                continue

        browser.close()
        print(f"\nPhase 2 complete! Processed details for {len(events_data)} events")

        return events_data

def scrape_viff_complete():
    try:
        # Phase 1: Get all listings
        events = scrape_viff_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return []

        # Phase 2: Get details
        complete_events = scrape_viff_details(events)

        # Save final results
        os.makedirs("data", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save timestamped version
        timestamped_filename = f"data/viff_screenings_{timestamp}.json"
        with open(timestamped_filename, "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        print(f"\n{'='*50}")
        print(f"VIFF Scraping Complete")
        print(f"Total events: {len(complete_events)}")
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