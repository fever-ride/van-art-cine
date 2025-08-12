import json
import time
import random
import os
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError

def scrape_cinematheque_listings():
    """Phase 1: Scrape all basic info from calendar page"""
    url = "https://thecinematheque.ca/films/calendar"

    print("=== PHASE 1: Scraping Cinematheque Calendar ===")
    print("Collecting event titles, showtimes, and detail URLs...")

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

            page.wait_for_selector("#eventCalendar li", timeout=10000)
            print("✓ Calendar page loaded successfully")

        except TimeoutError:
            print("✗ No events found on the page.")
            browser.close()
            return []
        except Exception as e:
            print(f"✗ Failed to load calendar: {e}")
            browser.close()
            return []

        # Track unique events
        unique_events = {}
        total_showtimes = 0

        days = page.query_selector_all("#eventCalendar li")
        print(f"Found {len(days)} days with potential events")

        for day_index, day in enumerate(days):
            try:
                # Get date parts
                day_el = day.query_selector(".day")
                if not day_el:
                    continue  # skip empty days

                dom = day_el.query_selector(".dom")
                mon = day_el.query_selector(".mon")
                year = day_el.query_selector(".year")

                if not (dom and mon and year):
                    continue

                date_str = f"{year.inner_text().strip()}-{mon.inner_text().strip()}-{dom.inner_text().strip().zfill(2)}"

                # Get programs for this day
                program_items = day.query_selector_all(".programs li")

                if not program_items:
                    continue

                print(f"\n  Processing {date_str}...")

                for item_index, item in enumerate(program_items):
                    try:
                        time_el = item.query_selector(".details span")
                        title_el = item.query_selector(".programTitle")

                        if not title_el:
                            continue

                        time_text = time_el.inner_text().strip() if time_el else "No time"
                        title = title_el.inner_text().strip()
                        href = title_el.get_attribute("href")

                        # Build full URL
                        if href:
                            if href.startswith("/"):
                                detail_url = f"https://thecinematheque.ca{href}"
                            else:
                                detail_url = href
                        else:
                            detail_url = "No detail url found"

                        # Create showtime entry
                        showtime = {
                            "date": date_str,
                            "time": time_text,
                            "venue": "The Cinematheque"
                        }

                        # Check if we already have this event title
                        if title in unique_events:
                            # Add this showtime to existing event
                            unique_events[title]["showtimes"].append(showtime)
                        else:
                            # Create new event entry (details will be filled in Phase 2)
                            unique_events[title] = {
                                "title": title,
                                "director": "To be scraped",
                                "duration": "To be scraped",
                                "detail_url": detail_url,
                                "year": "To be scraped",
                                "showtimes": [showtime]
                            }

                        total_showtimes += 1
                        print(f"    ✓ {item_index + 1}/{len(program_items)}: {title} at {time_text}")

                    except Exception as e:
                        print(f"    ✗ Error processing program {item_index + 1}: {e}")
                        continue

                print(f"  ✓ {date_str}: {len(program_items)} programs processed")

            except Exception as e:
                print(f"  ✗ Error processing day {day_index + 1}: {e}")
                continue

        # Convert to list
        results = list(unique_events.values())

        browser.close()

        # Save Phase 1 results
        os.makedirs("data", exist_ok=True)
        with open("data/cinematheque_listings_only.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        print(f"\n✓ Phase 1 complete!")
        print(f"Unique events found: {len(results)}")
        print(f"Total showtimes: {total_showtimes}")
        print("Saved basic listings to: data/cinematheque_listings_only.json")

        return results

def scrape_cinematheque_details(events_data):
    """Phase 2: Scrape director, year, duration from individual event pages"""
    print(f"\n=== PHASE 2: Scraping Detail Pages ===")

    # Filter events that have valid detail URLs
    events_with_urls = [e for e in events_data if e.get("detail_url") and
                       e["detail_url"] != "No detail url found" and
                       e["detail_url"].startswith("http")]

    print(f"Processing {len(events_with_urls)} events with detail URLs...")

    if not events_with_urls:
        print("No events have detail URLs to process.")
        # Set default values for events without URLs
        for event in events_data:
            event["director"] = "No director found"
            event["duration"] = "No duration found"
            event["year"] = "No year found"
        return events_data

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Same headers as phase 1
        page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        })

        for i, event in enumerate(events_with_urls):
            detail_url = event["detail_url"]

            try:
                print(f"    {i+1}/{len(events_with_urls)}: Getting details for '{event['title']}'")

                page.goto(detail_url, timeout=30000)

                time.sleep(random.uniform(1.5, 3.0))

                # Extract details using specific CSS selectors (much cleaner!)
                director = "No director found"
                year = "No year found"
                duration = "No duration found"

                try:
                    director_el = page.query_selector(".filmDirector")
                    if director_el:
                        director = director_el.inner_text().strip()

                    year_el = page.query_selector(".filmYear")
                    if year_el:
                        year = year_el.inner_text().strip()

                    # Duration is in .filmRuntime class
                    runtime_el = page.query_selector(".filmRuntime")
                    if runtime_el:
                        runtime_text = runtime_el.inner_text().strip()
                        # Extract number from text like "143"
                        if runtime_text.isdigit():
                            duration = f"{runtime_text} mins"
                        else:
                            # Handle cases like "143 min" or other formats
                            duration_match = re.search(r'(\d+)', runtime_text)
                            if duration_match:
                                duration = f"{duration_match.group(1)} mins"

                    print(f"        ✓ Found: {director} ({year}) - {duration}")

                    # Update the event data with extracted info
                    event["director"] = director
                    event["year"] = year
                    event["duration"] = duration

                except Exception as extraction_error:
                    print(f"        ⚠ Error extracting details: {extraction_error}")
                    # Simple fallback
                    event["director"] = "Error retrieving director"
                    event["year"] = "Error retrieving year"
                    event["duration"] = "Error retrieving duration"

            except Exception as e:
                print(f"        ✗ Error getting details for {event['title']}: {e}")
                # Set fallback values
                event["director"] = "Error retrieving director"
                event["year"] = "Error retrieving year"
                event["duration"] = "Error retrieving duration"
                continue

        # Set default values for events without detail URLs
        for event in events_data:
            if event not in events_with_urls:
                event["director"] = "No director found"
                event["duration"] = "No duration found"
                event["year"] = "No year found"

        browser.close()
        print(f"\n✓ Phase 2 complete! Processed details for {len(events_with_urls)} events")

        return events_data

def scrape_cinematheque_complete():
    """Complete Cinematheque scraping process: listings + details"""
    try:
        # Phase 1: Get all listings (titles, showtimes, URLs)
        events = scrape_cinematheque_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return []

        # Phase 2: Get details (director, year, duration from detail pages)
        complete_events = scrape_cinematheque_details(events)

        # Save final results
        os.makedirs("data", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save timestamped version
        timestamped_filename = f"data/cinematheque_screenings_{timestamp}.json"
        with open(timestamped_filename, "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        # Save current version
        with open("data/cinematheque_screenings.json", "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        print(f"\n{'='*50}")
        print(f"🎬 Cinematheque Scraping Complete! 🎬")
        print(f"Total unique events: {len(complete_events)}")
        print(f"Events with detail URLs: {len([e for e in complete_events if e.get('detail_url', '').startswith('http')])}")
        total_showtimes = sum(len(e.get('showtimes', [])) for e in complete_events)
        print(f"Total showtimes: {total_showtimes}")
        print(f"Saved to: {timestamped_filename}")
        print(f"Also saved to: data/cinematheque_screenings.json")

        return complete_events

    except KeyboardInterrupt:
        print("\nScraping interrupted by user. Check data folder for partial results.")
        return []
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return []

if __name__ == "__main__":
    scrape_cinematheque_complete()