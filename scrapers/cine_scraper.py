import json
from playwright.sync_api import sync_playwright

def scrape_cinematheque():
    url = "https://thecinematheque.ca/films/calendar"
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, timeout=60000)
        page.wait_for_selector("#eventCalendar li", timeout=10000)

        days = page.query_selector_all("#eventCalendar li")

        for day in days:
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

            # Get programs
            films = []
            program_items = day.query_selector_all(".programs li")

            for item in program_items:
                time_el = item.query_selector(".details span")
                title_el = item.query_selector(".programTitle")
                if not title_el:
                    continue

                time = time_el.inner_text().strip() if time_el else "Unknown time"
                title = title_el.inner_text().strip()
                href = title_el.get_attribute("href")

                films.append({
                    "time": time,
                    "title": title,
                    "url": f"https://thecinematheque.ca{href}" if href.startswith("/") else href
                })

            if films:
                results.append({
                    "date": date_str,
                    "films": films
                })

        browser.close()

    # Save to file
    with open("data/cinematheque_screenings.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        print("\nSaved to data/cinematheque_screenings.json")

if __name__ == "__main__":
    scrape_cinematheque()