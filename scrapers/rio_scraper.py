import json
from playwright.sync_api import sync_playwright, TimeoutError

def scrape_rio():
    url = "https://riotheatre.ca/calendar/"
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, timeout=60000)

        # Wait until events are present
        try:
            page.wait_for_selector(".an-event__title", timeout=15000)
        except TimeoutError:
            print("No events found on the page.")
            return

        days = page.query_selector_all(".day")

        for day in days:
            # the full date label
            date_el = (day.query_selector(".day__label--full-date")
                       or day.query_selector(".day__label"))
            if not date_el:
                continue
            date_str = date_el.inner_text().strip()

            # the event block for that day
            event_blocks = day.query_selector_all(".an-event__contained-event.an-event")
            events = []
            for ev in event_blocks:
                time_el = ev.query_selector(".an-event__time")
                title_el = ev.query_selector(".an-event__title")
                if not title_el:
                    continue
                time = time_el.inner_text().strip() if time_el else "Unknown time"
                title = title_el.inner_text().strip()
                events.append({"time": time, "title": title})

            if events:
                results.append({"date": date_str, "events": events})

        browser.close()

    with open("data/rio_screenings.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        print("Saved to data/rio_screenings.json")

if __name__ == "__main__":
    scrape_rio()