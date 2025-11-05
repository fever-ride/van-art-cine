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

        unique_events = {}
        total_showtimes = 0

        days = page.query_selector_all("#eventCalendar li")
        print(f"Found {len(days)} days with potential events")

        for day_index, day in enumerate(days):
            try:
                day_el = day.query_selector(".day")
                if not day_el:
                    continue

                dom = day_el.query_selector(".dom")
                mon = day_el.query_selector(".mon")
                year = day_el.query_selector(".year")

                if not (dom and mon and year):
                    continue

                date_str = f"{year.inner_text().strip()}-{mon.inner_text().strip()}-{dom.inner_text().strip().zfill(2)}"

                program_items = day.query_selector_all(".programs li")

                if not program_items:
                    continue

                print(f"\n  Processing {date_str}...")

                for item_index, item in enumerate(program_items):
                    try:
                        time_el = item.query_selector(".details .time")
                        time_text = None

                        if time_el:
                            raw_time = time_el.inner_text().strip()
                            classes = (time_el.get_attribute(
                                "class") or "").lower()
                            suffix = " pm" if " pm" in f" {classes} " else (
                                " am" if " am" in f" {classes} " else "")
                            time_text = raw_time + suffix

                        title_el = item.query_selector(".programTitle")
                        if not title_el:
                            continue

                        title = title_el.inner_text().strip()
                        href = title_el.get_attribute("href")

                        detail_url = None
                        if href:
                            if href.startswith("/"):
                                detail_url = f"https://thecinematheque.ca{href}"
                            else:
                                detail_url = href

                        showtime = {
                            "date": date_str,
                            "time": time_text,
                            "venue": "The Cinematheque"
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
                                "detail_url": detail_url,
                                "showtimes": [showtime]
                            }

                        total_showtimes += 1
                        print(
                            f"    ✓ {item_index + 1}/{len(program_items)}: {title} at {time_text or 'No time'}")

                    except Exception as e:
                        print(
                            f"    ✗ Error processing program {item_index + 1}: {e}")
                        continue

                print(
                    f"  ✓ {date_str}: {len(program_items)} programs processed")

            except Exception as e:
                print(f"  ✗ Error processing day {day_index + 1}: {e}")
                continue

        results = list(unique_events.values())
        browser.close()

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
            "Accept-Language": "en-US,en;q=0.5"
        })

        for i, event in enumerate(events_with_urls):
            detail_url = event["detail_url"]

            try:
                print(
                    f"    {i+1}/{len(events_with_urls)}: Getting details for '{event['title']}'")

                page.goto(detail_url, timeout=30000)
                time.sleep(random.uniform(1.5, 3.0))

                try:
                    director_el = page.query_selector(".filmDirector")
                    if director_el:
                        director_text = director_el.inner_text().strip()
                        if director_text:
                            event["director"] = director_text

                    year_el = page.query_selector(".filmYear")
                    if year_el:
                        year_text = year_el.inner_text().strip()
                        if year_text:
                            event["year"] = year_text

                    runtime_el = page.query_selector(".filmRuntime")
                    if runtime_el:
                        runtime_text = runtime_el.inner_text().strip()
                        if runtime_text:
                            if runtime_text.isdigit():
                                event["duration"] = f"{runtime_text} mins"
                            else:
                                duration_match = re.search(
                                    r'(\d+)', runtime_text)
                                if duration_match:
                                    event["duration"] = f"{duration_match.group(1)} mins"

                    found_info = []
                    if event.get("director"):
                        found_info.append(f"Director: {event['director']}")
                    if event.get("year"):
                        found_info.append(f"Year: {event['year']}")
                    if event.get("duration"):
                        found_info.append(f"Duration: {event['duration']}")

                    if found_info:
                        print(f"        ✓ Found: {', '.join(found_info)}")
                    else:
                        print(f"        ⚠ No details found on page")

                except Exception as extraction_error:
                    print(
                        f"        ⚠ Error extracting details: {extraction_error}")

            except Exception as e:
                print(
                    f"        ✗ Error loading page for {event['title']}: {e}")
                continue

        browser.close()
        print(
            f"\n✓ Phase 2 complete! Processed details for {len(events_with_urls)} events")

        return events_data


def scrape_cinematheque_complete():
    """Complete Cinematheque scraping process: listings + details"""
    try:
        events = scrape_cinematheque_listings()

        if not events:
            print("No events found in Phase 1. Stopping.")
            return []

        complete_events = scrape_cinematheque_details(events)

        os.makedirs("data", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        timestamped_filename = f"data/cinematheque_screenings_{timestamp}.json"
        with open(timestamped_filename, "w", encoding="utf-8") as f:
            json.dump(complete_events, f, ensure_ascii=False, indent=2)

        events_with_director = len(
            [e for e in complete_events if e.get("director")])
        events_with_year = len([e for e in complete_events if e.get("year")])
        events_with_duration = len(
            [e for e in complete_events if e.get("duration")])
        total_showtimes = sum(len(e.get('showtimes', []))
                              for e in complete_events)

        print(f"\n{'='*50}")
        print(f"🎬 Cinematheque Scraping Complete! 🎬")
        print(f"Total unique events: {len(complete_events)}")
        print(f"Events with director: {events_with_director}")
        print(f"Events with year: {events_with_year}")
        print(f"Events with duration: {events_with_duration}")
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
    scrape_cinematheque_complete()
