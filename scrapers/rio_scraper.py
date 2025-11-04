import json
import time
import random
import os
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError


def scrape_rio_listings():
    # Phase 1: Collect all basic event info from calendar (no clicking)
    url = "https://riotheatre.ca/calendar/"

    print("=== PHASE 1: Scraping Rio Theatre Calendar ===")
    print("Collecting event titles and showtimes...")

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

        # Collect all event info without clicking
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

                        time_text = time_el.inner_text().strip() if time_el else "No time"
                        title = title_el.inner_text().strip()

                        showtime = {
                            "date": date_str,
                            "time": time_text,
                            "venue": "Rio Theatre"
                        }

                        if title in unique_events:
                            unique_events[title]["showtimes"].append(showtime)
                        else:
                            unique_events[title] = {
                                "title": title,
                                "director": "To be scraped",
                                "duration": "To be scraped",
                                "detail_url": "To be scraped",
                                "year": "To be scraped",
                                "showtimes": [showtime]
                            }

                        total_showtimes += 1
                        print(
                            f"    ✓ {event_index + 1}/{len(event_blocks)}: {title} at {time_text}")

                    except Exception as e:
                        print(
                            f"    ✗ Error processing event {event_index + 1}: {e}")
                        continue

            except Exception as e:
                print(f"  ✗ Error processing day {day_index + 1}: {e}")
                continue

        results = list(unique_events.values())
        browser.close()

        # Save Phase 1 results
        os.makedirs("data", exist_ok=True)
        with open("data/rio_listings_only.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print(f"\n✓ Phase 1 complete")
        print(f"Unique events found: {len(results)}")
        print(f"Total showtimes: {total_showtimes}")
        print("Saved basic listings to: data/rio_listings_only.json")

        return results


def scrape_rio_details_by_clicking(events_data):
    # Phase 2: Click each unique event to get detail info
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
                # Find this specific event on the calendar by title text
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
                    event["director"] = "Event not found on calendar"
                    event["duration"] = "Event not found on calendar"
                    event["detail_url"] = "Event not found on calendar"
                    event["year"] = "Event not found on calendar"
                    continue

                print(f"    → Clicking '{title}'...")

                # Click the event
                target_event.click()

                # Wait for navigation
                page.wait_for_load_state("networkidle", timeout=15000)
                time.sleep(random.uniform(1.5, 3.0))

                # Get detail URL
                detail_url = page.url

                # Initialize default values
                director = "No director found"
                year = "No year found"
                duration = "No duration found"

                # Extract all details from the byline element
                try:
                    detail_str_el = page.query_selector("h3.byline")
                    if detail_str_el:
                        detail_str = detail_str_el.inner_text().strip()
                        print(f"    Found byline: {detail_str}")

                        parts = []
                        for part in detail_str.split('|'):
                            parts.append(part.strip())

                        # Extract year (always first)
                        if len(parts) > 0:
                            year_candidate = parts[0]
                            if year_candidate.isdigit() and len(year_candidate) == 4:
                                year = year_candidate
                            else:
                                print(
                                    f"    ⚠ Year validation failed: '{year_candidate}' is not a valid year")

                        # Extract duration (always last) with better validation
                        if len(parts) > 1:
                            duration_text = parts[-1]
                            # Look for duration with "minutes" or "mins" validation
                            duration_match = re.search(
                                r'(\d+)\s*(?:minutes?|mins?)', duration_text, re.IGNORECASE)
                            if duration_match:
                                duration_number = duration_match.group(1)
                                if duration_number.isdigit():
                                    duration = f"{duration_number} mins"
                                else:
                                    print(
                                        f"    ⚠ Duration number validation failed: '{duration_number}' is not a valid number")
                            else:
                                print(
                                    f"    ⚠ Duration format validation failed: '{duration_text}' doesn't contain 'minutes' or 'mins'")

                        # Extract director using patterns directly on the byline string
                        # Pattern 1: Format with rating "Year | Rating | Countries | Director | Language | Duration"
                        pattern1 = r'(\d{4})\s*\|\s*[^|]+\s*\|\s*[^|]+\s*\|\s*([^|]+?)\s*\|\s*[^|]*\|\s*(\d+)\s*minutes?'
                        match1 = re.search(pattern1, detail_str, re.IGNORECASE)

                        if match1:
                            director = match1.group(2).strip()
                            print(
                                f"    ✓ Pattern 1 - Found director: {director}")
                        else:
                            # Pattern 2: Format without rating "Year | Countries | Director | Language | Duration"
                            pattern2 = r'(\d{4})\s*\|\s*[^|]+\s*\|\s*([^|]+?)\s*\|\s*[^|]*\|\s*(\d+)\s*minutes?'
                            match2 = re.search(
                                pattern2, detail_str, re.IGNORECASE)

                            if match2:
                                director = match2.group(2).strip()
                                print(
                                    f"    ✓ Pattern 2 - Found director: {director}")
                            else:
                                print(
                                    f"    ⚠ Director extraction failed from byline")

                        # Summary of extraction results
                        if year != "No year found" and duration != "No duration found" and director != "No director found":
                            print(f"    ✓ Complete extraction successful")
                        else:
                            print(
                                f"    ⚠ Partial extraction: year={year}, duration={duration}, director={director}")

                    else:
                        print(f"    ⚠ No byline element found on detail page")

                except Exception as e:
                    print(f"    ⚠ Byline extraction failed: {e}")

                # Update event data
                event["director"] = director
                event["year"] = year
                event["duration"] = duration
                event["detail_url"] = detail_url

                print(f"    ✓ Final result: {director} ({year}) - {duration}")

                # Navigate back to calendar
                page.go_back()
                page.wait_for_selector(".an-event__title", timeout=10000)
                time.sleep(random.uniform(1.0, 2.0))

            except Exception as e:
                print(f"    ✗ Error processing '{title}': {e}")

                # Set error values
                event["director"] = "Error retrieving director"
                event["year"] = "Error retrieving year"
                event["duration"] = "Error retrieving duration"
                event["detail_url"] = "Error retrieving URL"

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
        # Phase 1: Get all basic listings
        events = scrape_rio_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return []

        # Phase 2: Click events for details
        complete_events = scrape_rio_details_by_clicking(events)

        # Save final results
        os.makedirs("data", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        timestamped_filename = f"data/rio_screenings_{timestamp}.json"
        with open(timestamped_filename, "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        with open("data/rio_screenings.json", "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        print(f"\n{'='*50}")
        print(f"🎬 Rio Theatre Scraping Complete! 🎬")
        print(f"Total unique events: {len(complete_events)}")
        successful_details = len([e for e in complete_events if e.get('director', '') not in [
                                 'To be scraped', 'Error retrieving director', 'Event not found on calendar']])
        print(f"Events with details: {successful_details}")
        total_showtimes = sum(len(e.get('showtimes', []))
                              for e in complete_events)
        print(f"Total showtimes: {total_showtimes}")
        print(f"Saved to: {timestamped_filename}")
        print(f"Also saved to: data/rio_screenings.json")

        return complete_events

    except KeyboardInterrupt:
        print("\nScraping interrupted by user. Check data folder for partial results.")
        return []
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return []


if __name__ == "__main__":
    scrape_rio_complete()
