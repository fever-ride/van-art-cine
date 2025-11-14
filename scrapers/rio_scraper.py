import json
import time
import random
import os
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
# project_root/data/test
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "test")


def scrape_rio_listings():
    url = "https://riotheatre.ca/calendar/"

    print("=== PHASE 1: Scraping Rio Theatre Calendar ===")
    print("Collecting event titles and showtimes...")

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

        try:
            print(f"Loading: {url}")
            page.goto(url, timeout=60000)
            time.sleep(random.uniform(2.0, 4.0))
            page.wait_for_selector(".an-event__title", timeout=15000)
            print("✓ Calendar page loaded successfully")

        except TimeoutError:
            print("✗ No events found on the page.")
            browser.close()
            return []
        except Exception as e:
            print(f"✗ Failed to load calendar: {e}")
            browser.close()
            return []

        unique_events = {}
        total_showtimes = 0

        days = page.query_selector_all(".day")
        print(f"Found {len(days)} days with events")

        for day_index, day in enumerate(days):
            try:
                date_el = (day.query_selector(".day__label--full-date")
                           or day.query_selector(".day__label"))
                if not date_el:
                    continue

                date_str = date_el.inner_text().strip()
                print(f"\n  Processing {date_str}...")

                event_blocks = day.query_selector_all(
                    ".an-event__contained-event.an-event")
                if not event_blocks:
                    continue

                for event_index, event_block in enumerate(event_blocks):
                    try:
                        time_el = event_block.query_selector(".an-event__time")
                        title_el = event_block.query_selector(
                            ".an-event__title")

                        if not title_el:
                            continue

                        time_text = None
                        if time_el:
                            time_text = time_el.inner_text().strip()
                            if not time_text:
                                time_text = None

                        title = title_el.inner_text().strip()

                        showtime = {
                            "date": date_str,
                            "time": time_text,
                            "venue": "Rio Theatre"
                        }

                        if title in unique_events:
                            unique_events[title]["showtimes"].append(showtime)
                        else:
                            # Initialize all fields to null
                            unique_events[title] = {
                                "title": title,
                                "director": None,
                                "year": None,
                                "duration": None,
                                "detail_url": None,
                                "showtimes": [showtime]
                            }

                        total_showtimes += 1
                        print(
                            f"    ✓ {event_index + 1}/{len(event_blocks)}: {title} at {time_text or 'No time'}")

                    except Exception as e:
                        print(
                            f"    ✗ Error processing event {event_index + 1}: {e}")
                        continue

            except Exception as e:
                print(f"  ✗ Error processing day {day_index + 1}: {e}")
                continue

        results = list(unique_events.values())
        browser.close()

        print(f"\n✓ Phase 1 complete")
        print(f"Unique events found: {len(results)}")
        print(f"Total showtimes: {total_showtimes}")
        # no longer save the intermediate file.

        return results


def scrape_rio_details_by_clicking(events_data):
    url = "https://riotheatre.ca/calendar/"

    print(f"\n=== PHASE 2: Clicking Events for Details ===")
    print(f"Processing {len(events_data)} unique events...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        })

        try:
            page.goto(url, timeout=60000)
            time.sleep(random.uniform(2.0, 4.0))
            page.wait_for_selector(".an-event__title", timeout=15000)
        except Exception as e:
            print(f"✗ Failed to load calendar for Phase 2: {e}")
            browser.close()
            return events_data

        for event_index, event in enumerate(events_data):
            title = event["title"]
            print(
                f"\n  {event_index + 1}/{len(events_data)}: Looking for '{title}'...")

            try:
                event_elements = page.query_selector_all(
                    ".an-event__contained-event.an-event")
                target_event = None

                for el in event_elements:
                    title_el = el.query_selector(".an-event__title")
                    if title_el and title_el.inner_text().strip() == title:
                        target_event = el
                        break

                if not target_event:
                    print(f"    ✗ Could not find event '{title}' on calendar")
                    continue

                print(f"    → Clicking '{title}'...")
                target_event.click()

                page.wait_for_load_state("networkidle", timeout=15000)
                time.sleep(random.uniform(1.5, 3.0))

                # Get detail URL
                detail_url = page.url
                if detail_url and detail_url != url:
                    event["detail_url"] = detail_url

                # Extract details from byline
                try:
                    detail_str_el = page.query_selector("h3.byline")
                    if detail_str_el:
                        detail_str = detail_str_el.inner_text().strip()
                        print(f"    Found byline: {detail_str}")

                        parts = [part.strip()
                                 for part in detail_str.split('|')]

                        # Extract year (first part)
                        if len(parts) > 0:
                            year_candidate = parts[0]
                            if year_candidate.isdigit() and len(year_candidate) == 4:
                                event["year"] = year_candidate

                        # Extract duration (last part)
                        if len(parts) > 1:
                            duration_text = parts[-1]
                            duration_match = re.search(
                                r'(\d+)\s*(?:minutes?|mins?)', duration_text, re.IGNORECASE)
                            if duration_match:
                                duration_number = duration_match.group(1)
                                if duration_number.isdigit():
                                    event["duration"] = f"{duration_number} mins"

                        # Extract director
                        pattern1 = r'(\d{4})\s*\|\s*[^|]+\s*\|\s*[^|]+\s*\|\s*([^|]+?)\s*\|\s*[^|]*\|\s*(\d+)\s*minutes?'
                        match1 = re.search(pattern1, detail_str, re.IGNORECASE)

                        if match1:
                            director_text = match1.group(2).strip()
                            if director_text:
                                event["director"] = director_text
                                print(
                                    f"    ✓ Pattern 1 - Found director: {director_text}")
                        else:
                            pattern2 = r'(\d{4})\s*\|\s*[^|]+\s*\|\s*([^|]+?)\s*\|\s*[^|]*\|\s*(\d+)\s*minutes?'
                            match2 = re.search(
                                pattern2, detail_str, re.IGNORECASE)

                            if match2:
                                director_text = match2.group(2).strip()
                                if director_text:
                                    event["director"] = director_text
                                    print(
                                        f"    ✓ Pattern 2 - Found director: {director_text}")

                        # Summary
                        found_fields = []
                        if event.get("year"):
                            found_fields.append(f"year={event['year']}")
                        if event.get("duration"):
                            found_fields.append(
                                f"duration={event['duration']}")
                        if event.get("director"):
                            found_fields.append(
                                f"director={event['director']}")

                        if found_fields:
                            print(
                                f"    ✓ Extracted: {', '.join(found_fields)}")
                        else:
                            print(f"    ⚠ No details extracted from byline")

                    else:
                        print(f"    ⚠ No byline element found on detail page")

                except Exception as e:
                    print(f"    ⚠ Byline extraction failed: {e}")

                # Navigate back
                page.go_back()
                page.wait_for_selector(".an-event__title", timeout=10000)
                time.sleep(random.uniform(1.0, 2.0))

            except Exception as e:
                print(f"    ✗ Error processing '{title}': {e}")

                # Try to get back to calendar
                try:
                    page.goto(url, timeout=30000)
                    page.wait_for_selector(".an-event__title", timeout=10000)
                    time.sleep(random.uniform(1.0, 2.0))
                except:
                    print(f"    ✗ Failed to reload calendar")
                    break

        browser.close()
        print(f"\n✓ Phase 2 complete!")
        return events_data


def scrape_rio_complete():
    """Complete Rio Theatre scraping: collect listings, then get details"""
    try:
        events = scrape_rio_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return []

        complete_events = scrape_rio_details_by_clicking(events)

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
        total_showtimes = sum(len(e.get('showtimes', []))
                              for e in complete_events)

        print(f"\n{'='*50}")
        print(f"🎬 Rio Theatre Scraping Complete! 🎬")
        print(f"Total unique events: {len(complete_events)}")
        print(f"Events with director: {events_with_director}")
        print(f"Events with year: {events_with_year}")
        print(f"Events with duration: {events_with_duration}")
        print(f"Events with detail URL: {events_with_url}")
        print(f"Total showtimes: {total_showtimes}")
        print(f"Saved to: {output_path}")

        return complete_events

    except KeyboardInterrupt:
        print("\nScraping interrupted by user. Check data folder for partial results.")
        return []
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return []


if __name__ == "__main__":
    scrape_rio_complete()
