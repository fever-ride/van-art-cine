"""
Shared "did this scraper's extraction silently break" sanity check, used by
all three cinema scrapers (rio_scraper.py, viff_scraper.py, cine_scraper.py).

Exists because Rio's own detail-page selectors changed at some point and
quietly started matching nothing -- director/year/runtime all silently went
to 0% for about two months before anyone noticed, since a selector finding
nothing looks identical to "this particular event legitimately has no
director" (a concert, a comedy night, etc.).

0.15 is one shared threshold, not tuned per cinema, checked against this
project's own historical scrape snapshots (data/latest/*_screenings_*.json)
before picking it:
  - VIFF and Cinematheque list almost entirely real films and never dropped
    below ~72-80% director-fill-rate across 31 historical runs each.
  - Rio mixes in comedy nights, concerts, etc. with no director at all, and
    is noisier, but never dropped below ~31% outside of the real ~2-month
    breakage (which sat at a flat 0%, not a gradual decline).
0.15 sits comfortably below every source's lowest *legitimate* observed
value, with a wide margin, while still catching a real "selector matches
nothing anymore" break on its very first run.
"""

DEFAULT_THRESHOLD = 0.15
# Below this many events, one unusual night (e.g. an all-concert evening)
# can look like a trend on its own -- not enough signal to judge.
MIN_EVENTS_TO_CHECK = 5


def check_extraction_health(events, field, threshold=DEFAULT_THRESHOLD, min_events=MIN_EVENTS_TO_CHECK):
    """
    Returns (ok, rate, message).

    `ok` is True when there aren't enough events to judge (fewer than
    `min_events`) or when the fraction of events with a truthy `field` is
    at or above `threshold`. `message` is a human-readable explanation,
    set only when `ok` is False.
    """
    if len(events) < min_events:
        return True, 1.0, None

    with_field = sum(1 for e in events if e.get(field))
    rate = with_field / len(events)

    if rate < threshold:
        message = (
            f"only {rate:.0%} of {len(events)} events have '{field}' "
            f"(expected at least {threshold:.0%}) -- this site's detail-page "
            f"selectors may have changed again."
        )
        return False, rate, message

    return True, rate, None
