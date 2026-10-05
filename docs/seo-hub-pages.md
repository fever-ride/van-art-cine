# SEO Hub Pages

Requirements, design notes, and implementation direction for aggregate hub
pages and related discoverability work. This grew out of the structured
data audit that produced BACKLOG.md items SEO-1 through SEO-6, and it
records the reasoning behind why the original "genre, director, and time
period" idea (old SEO-3) got split apart. Read this before starting any of
the SEO-3, SEO-7, SEO-8, SEO-9, SEO-10, or SEO-13 items in BACKLOG.md.

## Background

The original idea was a single backlog item: build hub pages that
aggregate films by genre, by director, and by time period, such as
"this week in Vancouver arthouse cinema." A closer look at the actual data
and at the homepage's current implementation changed the shape of that
plan.

### What the data actually looks like

Checked against the local database on 2026-07-31:

- Only about 13 films have an active, upcoming screening at any given time.
  This is a small, low volume aggregator across 3 venues, not a large
  multiplex chain site.
- Genre buckets are thin. Among currently showing films, `Documentary` and
  `Drama` each had 3 films, and most other genres had exactly 1.
- Director buckets are almost always thin to the point of being pointless.
  Nearly every director with a film currently showing has exactly one film
  showing. A hub page for that director would just repeat the film's own
  detail page with no added content.
- `film.genre` is a raw, comma separated string copied from OMDb, for
  example `"Comedy, Drama, Family"`, and sometimes the literal value `N/A`.
  It needs parsing and cleanup before it can back any kind of category
  page.
- `screening.tags` already holds a clean, short list of event style tags
  produced by the AI title cleaning step in `load_json.py`. Examples seen
  in the data: `Q&A`, `Director in attendance`, `Filmmaker in attendance`,
  `Live music`, `Live score`, `4K restoration`, `Restoration`, `Remaster`,
  `Special guest`, `Post-screening discussion`, `Anniversary screening`,
  and several `Hosted by <name>` values.
- `film.country` and `film.language` exist but are sparse and inconsistent
  on the films currently showing. Several rows have `null` or `N/A`.
- `watchlist_screening` has only 17 rows total, and the most saved film has
  a single save. Not enough signal yet to rank anything as "trending" or
  "most saved."

### What the homepage actually does today

The homepage renders its screening list entirely client side today, with
no structured data of its own. Full technical detail is in
`docs/specs/homepage-ssr.md`.

This matters because the homepage is the single highest authority page on
the site, and it is already trying to do the job that a "this week in
Vancouver arthouse cinema" hub page would do. Building a second, separate
hub page for that purpose would duplicate a job the homepage should be
doing natively, instead of fixing the homepage itself.

## Decisions

### Genre and director as pages: not now

Director hub pages are dropped, not just deferred, because the problem is
structural. This site typically shows one film per director at a time. A
per-director page would almost never have more than one item to list. This
would not change until a venue runs something like a full director
retrospective with several films from the same person in the schedule at
once. If that ever happens, revisit this decision, but do not build
per-director pages speculatively ahead of that.

Genre pages are deferred, not dropped. Genre is a real, recurring category
that accumulates volume over months even though any single point in time
looks thin. For now, treat genre as a filter on the homepage rather than a
set of dedicated URLs. Revisit dedicated genre pages once simultaneous
inventory across the 3 venues grows enough that a genre page would
realistically list more than 2 or 3 films.

### Homepage server rendering: highest priority

Convert the homepage's screening list from client side fetching to server
rendering, and add page level structured data once that is in place. This
item replaces the "time period hub page" part of the original SEO-3 idea.
The homepage already is that page. It needs to be built correctly, not
duplicated.

Full requirements, acceptance criteria, and task breakdown for this item
live in `docs/specs/homepage-ssr.md`. That document is the source of truth
for this piece of work. This section only records why it was prioritized
above the other hub page directions.

### Tag based hub pages: reassessed, deferred (BACKLOG.md SEO-7)

This looked like the strongest new direction on paper — `screening.tags`
is already populated and already clean — but checking the actual data
before building anything (2026-09-29) found two problems:

- Volume right now is thin: only 4 upcoming screenings have any tag at
  all, versus ~10-20/month historically. Future screenings just haven't
  been through the tagging pass yet as they approach their date, so this
  alone might resolve itself over time.
- The more serious problem: tag coverage is not evenly spread across
  venues. Of 174 tagged screenings all-time, 89% (155) are from Rio
  Theatre alone; The Cinematheque, a major venue, has 0-1. A hub page for
  "Q&A screenings in Vancouver" built from this data would really be "Rio
  Theatre's own event calendar" — a real accuracy problem, not a volume
  one, and one that does not resolve itself just by waiting for more
  screenings to get tagged, unless other venues start marking up their own
  listings as consistently as Rio Theatre does.

If this is revisited, the taxonomy proposal below is still the right
starting point. `/whats-on/<category-slug>` is still the intended URL
shape — see `frontend/app/whats-on/top-rated/page.tsx` for the hub page
that ended up using this namespace instead.

- Group tags into a small set of canonical categories. A first pass
  grouping might look like:
  - Q&A and filmmaker presence: `Q&A`, `Director in attendance`,
    `Filmmaker in attendance`, `Introduction`, `Post-screening discussion`
  - Restoration and print format: `4K restoration`, `Restoration`,
    `Remaster`, `Special edition`
  - Live accompaniment: `Live music`, `Live score`
  - Milestone screenings: `Anniversary screening`,
    `20th Anniversary screening`
- Do not build a dedicated page per `Hosted by <name>` value. Those
  identify a specific host, not a repeatable category, and would be as
  thin as the director pages this document already deferred. If a specific
  host name is worth surfacing, do it as a detail on the screening itself,
  not as its own hub page.

### Top rated hub page: shipped (BACKLOG.md SEO-13)

The direction that actually replaced the tag idea above. Checked the real
numbers first (see BACKLOG.md SEO-13 for the full data investigation):
14 currently upcoming films at `imdb_rating >= 8.0`, 5 of them screening
within the next 7 days — real, usable volume, and not concentrated in one
venue the way tags turned out to be.

One page (`/whats-on/top-rated`), not two "this week"/"this month" pages:
the this-week list is always a strict subset of the this-month list (same
ranking, tighter date cutoff), so as separate indexable URLs the "this
week" page would carry no content the "this month" page doesn't already
have. A single page with a "this week" carousel highlight above the full
"this month" list avoids that duplication while still calling out what's
especially timely.

"New release by year" was also considered and shelved for now: 71% of the
currently upcoming catalog is a 2025/2026 title, which doesn't discriminate
anything — though this may just be VIFF festival season (this check was
done in late September, right in VIFF's own festival window) temporarily
flooding the catalog with brand new premieres. Worth re-checking outside
festival season before deciding this one either way.

### Country and language hub pages: lower priority

Same category of idea as genre pages, but with thinner and less
consistent data right now (`film.country` and `film.language` are
frequently null or `N/A` on currently showing films). Worth revisiting
after the genre and tag work ships and after data quality for these two
fields improves.

### Trending or most watchlisted page: blocked

Not viable yet. `watchlist_screening` only has 17 rows across the whole
site, and the most saved film has exactly one save. Revisit once the site
has enough registered users and watchlist activity that a "most saved this
week" ranking would reflect real signal instead of noise.

## Open questions

- Exact URL structure for tag based hub pages, and whether the taxonomy
  grouping above should live in code, in a config file, or in the
  database.
- Whether genre parsing and cleanup should happen at ingest time in
  `database/scripts/load_json.py`, or stay a frontend concern applied at
  read time.
- Whether the homepage's server rendering conversion should keep the
  existing filter UI behavior exactly as is, or whether filters should
  become URL driven query parameters that also work without JavaScript.
