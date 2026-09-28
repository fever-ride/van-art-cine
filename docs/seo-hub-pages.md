# SEO Hub Pages

Requirements, design notes, and implementation direction for aggregate hub
pages and related discoverability work. This grew out of the structured
data audit that produced BACKLOG.md items SEO-1 through SEO-6, and it
records the reasoning behind why the original "genre, director, and time
period" idea (old SEO-3) got split apart. Read this before starting any of
the SEO-3, SEO-7, SEO-8, SEO-9, or SEO-10 items in BACKLOG.md.

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

### Tag based hub pages: strongest new direction

`screening.tags` is the best supported new direction found so far. It is
already populated, already clean, and captures search intent that is
specific to arthouse audiences and unlikely to be served by a mainstream
cinema listing site: people looking for a Q&A screening, a live scored
film, or a restoration print.

Before building pages from this data, the raw tag values need a taxonomy
pass:

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
- Decide the URL shape before writing code. A candidate is
  `/whats-on/<category-slug>`, keeping it under a single namespace rather
  than introducing a separate top level route per category type.

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
