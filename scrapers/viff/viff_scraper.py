import json
from playwright.sync_api import sync_playwright

def scrape_viff():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://viff.org/whats-on/", timeout=60000)
        page.wait_for_selector(".c-event-card")

        cards = page.query_selector_all(".c-event-card")
        print(f"Found {len(cards)} cards")

        results = []

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

        browser.close()

        # Save to JSON file
        with open("data/viff_screenings.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
            print("\nSaved to viff_screenings.json")

if __name__ == "__main__":
    scrape_viff()