import json
from playwright.sync_api import sync_playwright, TimeoutError

def scrape_viff():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        results = []
        page_num = 1

        while True:
            url = f"https://viff.org/whats-on/page/{page_num}/"
            print(f"Scraping: {url}")
            page.goto(url, timeout=60000)

            try:
                page.wait_for_selector(".c-event-card", timeout=10000)
            except TimeoutError:
                print(f"No event cards found or page {page_num} does not exist. Stopping.")
                break

            cards = page.query_selector_all(".c-event-card")
            if not cards:
                print("No more cards. Stopping.")
                break

            for card in cards:
                title_el = card.query_selector(".c-event-card__title")
                title = title_el.inner_text().strip() if title_el else "No title found"

                instance_els = card.query_selector_all(".c-event-instance")
                showtimes = []

                for inst in instance_els:
                    time_el = inst.query_selector(".c-event-instance__time")
                    date_el = inst.query_selector(".c-event-instance__date span")

                    time = time_el.inner_text().strip() if time_el else "No time"
                    date = date_el.inner_text().strip() if date_el else "No date"

                    showtimes.append({"date": date, "time": time})

                results.append({
                    "title": title,
                    "showtimes": showtimes
                })

            page_num += 1

        browser.close()

        with open("data/viff_screenings.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
            print("\nSaved to viff_screenings.json")

if __name__ == "__main__":
    scrape_viff()