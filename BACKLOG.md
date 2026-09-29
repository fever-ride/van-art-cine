# Project Backlog

Ideas and known gaps across the project that were deliberately deferred. Not
urgent, not forgotten. Pick up whenever there is appetite.

Each area below keeps its own "Done" and "Still deferred" sections. Each
deferred item is its own numbered card, separated by a horizontal rule, and
follows a consistent format: Problem, Impact, Approach, and Priority.

## Data Pipeline

Scope: `database/scripts/`, `scrapers/`, `.github/workflows/pipeline.yml`.

### Done

#### Automate the pipeline with a scheduled GitHub Actions workflow

Shipped in `.github/workflows/pipeline.yml` and `scrapers/requirements.txt`.

- Cron runs every other day at 12:00 UTC, with a 0 to 60 minute jitter delay
  on scheduled runs.
- A manual `workflow_dispatch` trigger allows test runs from the Actions UI.
- Scrapers run first (`run_all_scrapers.py --continue-on-error`), then
  `database/scripts/run_all.py --stop-on-error`.
- Secrets are written into `database/.env` (`PROD_DATABASE_URL`,
  `TMDB_API_KEY`, `OMDB_API_KEY`, `OPENAI_API_KEY`).
- Logs are uploaded as a workflow artifact (`database/logs/`, 14 day
  retention).
- GitHub Actions already emails on workflow failure. This covers "the job
  ran and failed," not "the job never ran at all."

### Still deferred

---

#### DP-1. Add heartbeat monitoring for the pipeline schedule

**Problem:** GitHub Actions emails when a workflow run fails, but not when a
scheduled workflow stops running entirely, for example because of a bad cron
expression, a disabled workflow, or a billing issue. That failure mode
produces no email at all.

**Impact:** The pipeline could silently stop updating the site for days
before anyone notices.

**Approach:**
- Create a healthchecks.io check with a 2 day period and about 12 hours of
  grace time to cover jitter and long runs. Suggested name:
  `vancine data pipeline`.
- Add a repo secret `HEALTHCHECK_URL` set to the check's ping URL. Do not
  append `/start` or `/fail` to the secret itself.
- In `.github/workflows/pipeline.yml`, ping `.../start` at the beginning,
  the bare URL on success, and `.../fail` on failure.
- Map the secret to a job level `env` first if it needs to be used in an
  `if:` condition. Secrets cannot be referenced directly inside `if:`
  expressions.
- The free tier is enough for this project's scale.

**Priority:** Low.

---

#### DP-2. Make refresh_ratings.py default to a bounded limit

**Problem:** `refresh_ratings.py --limit` currently defaults to unbounded
(`None`).

**Impact:** This is a "safe default" design smell. An unbounded run should
be an explicit opt in choice, not the default behavior.

**Approach:** Change the default to a reasonable bounded number, and
require an explicit flag for an unbounded run.

**Priority:** Low.

---

#### DP-3. Build run scoped rollback tooling

**Problem:** `merge_staging_to_live.py` tags every `screening` row it writes
with `ops_ingest_run.id` through the `ingest_run_id` column. That could back
a "revert this specific run" script, but no such script exists yet. The
other per row commit steps, `omdb_api.py`, `resolve_imdb_id_url.py`,
`enrich_person_ids.py`, and `refresh_ratings.py`, have no run id tagging at
all.

**Impact:** If a bad run needs to be undone today, the only real options are
manual SQL, `edit_screenings_manual.py`, or a Render point in time restore.
The restore option undoes everything after a timestamp, not just the one
bad run.

**Approach:** Add run id tagging to the remaining per row commit steps,
then write a script that reverts every row written by a given
`ops_ingest_run.id`.

**Priority:** Medium.

---

#### DP-4. Add a log aggregation platform

**Problem:** Logs currently live only in `database/logs/` and in GitHub
Actions artifacts.

**Impact:** Not needed at this project's current scale.

**Approach:** If this becomes worth doing later, add a second
`logging.Handler` in `log_setup.py` next to the existing console and file
handlers. This keeps the change decoupled from wherever the pipeline
happens to run.

**Priority:** Low. Not needed yet.

---

#### DP-5. Run refresh_ratings.py on its own weekly schedule

**Problem:** `refresh_ratings.py` is not part of the main pipeline run.

**Impact:** This is intentional. Running it on every pipeline execution
would re-spend OMDb quota on films that are already enriched.

**Approach:** Add a separate scheduled workflow that runs
`refresh_ratings.py` on a weekly cadence.

**Priority:** Low. Optional.

---

#### DP-6. Strip director prefixes before searching TMDB by title

**Problem:** `resolve_imdb_id_url.py`'s fuzzy TMDB title search can miss
real, well known films when the scraped title has a director name baked
into it. For example, `John Woo's A Better Tomorrow` does not match TMDB's
plain title `A Better Tomorrow`.

**Impact:** This only affects the older fuzzy search fallback path, not the
newer known IMDb ID lookup described in DP-7. It was noticed while testing
that newer path.

**Approach:** Strip a leading `<Name>'s ` or `<Name>: ` pattern before
searching, similar to the existing `remove_parentheses` retry step.

**Priority:** Low.

---

#### DP-7. Extend scraped IMDb link support to Cinematheque and VIFF

**Problem:** `rio_scraper.py` now scrapes an `imdb_url` directly from the
venue's own movie pages, reading a sidebar block for director, runtime, and
year, plus a linked IMDb page. This replaced the old and unreliable
`h3.byline` text parsing. `load_json.py` seeds `film.imdb_id` from this
value, and `resolve_imdb_id_url.py` uses it to run an exact TMDB `/find`
lookup instead of a fuzzy title search.

**Impact:** Cinematheque and VIFF do not have this yet, so their films
still rely on the slower and less accurate fuzzy title search.

**Approach:** Check whether the Cinematheque and VIFF detail pages expose
similar sidebar information or structured data, and wire it through the
same way if they do.

**Priority:** Medium.

---

#### DP-8. Detect multi work events before trusting a scraped IMDb link

**Problem:** Rio sometimes uses a single detail page for a double feature or
another multi work event, but the page's sidebar and IMDb link describe
only one of the works shown. For example, `Greg Sestero Presents: Big Shark
& The Room` links only to The Room (`tt0368226`).

**Impact:** Treating that IMDb ID as the identity of the whole event caused
`merge_duplicate_films.py` to merge the entire event record into The Room.
Venue metadata cannot be trusted blindly here. The already merged Big Shark
and The Room record likely needs manual repair. A separate case involving
Backrooms is likely a valid single film normalization where presentation
details were lost, not a bad merge.

**Approach:** Before accepting a scraped IMDb ID, detect likely multi work
or program titles, such as double or triple features, an "A + B" pattern,
collections, or a film paired with a live show. As a check, compare the
scraped title against the canonical title that TMDB or IMDb returns for
that ID. If the ID only explains part of the event title, leave the ID
unset rather than merge incorrectly. Edition or presentation suffixes such
as "Restoration," "Final Screening," or "Everything Must Go Edition" should
be treated differently, since they usually still refer to a single
underlying film.

**Priority:** High. This has already caused one incorrect merge.

## Frontend Architecture

Scope: `frontend/` (Next.js app), core rendering and state design. This is
separate from the Frontend / SEO section below. Items here are structural
design problems, not individual SEO tasks, even though they were noticed
while working on SEO.

### Done

#### FE-1. Move screening filter state into the URL

Shipped per `docs/specs/url-driven-filters.md`. `useScreeningsUI`
(`frontend/lib/hooks/useScreeningsUI.ts`) now derives all filter state from
`searchParams` and writes it back with `router.push`/`router.replace`
instead of holding it as local React state, and `frontend/app/page.tsx` is
a Server Component that reads `searchParams` directly and renders any
filter combination server side, not just the default view.

- A filtered view now has its own bookmarkable, shareable, crawlable URL,
  and the browser's back/forward buttons step through filter changes.
- Discrete filter changes (cinema, sort, date) use `router.push`; the
  debounced search field uses `router.replace`, so rapid typing does not
  flood browser history.
- Removed the `initialItems`/skip-refetch workaround this item's problem
  statement anticipated SEO-3 would need — once filter state lived in the
  URL, `frontend/app/lib/screenings.ts`'s `getScreeningsServerSide` could
  just fetch directly from the Server Component for any filter/page
  combination, no client side data hook required.
- Along the way, fixed two scroll/layout regressions this refactor
  reintroduced from `TROUBLESHOOTING.md`'s "Homepage scroll jumps" story
  (see that doc's Act 5): missing `{ scroll: false }` on the new
  `setUI`-driven navigation, and a dropped effect that captured the result
  row height before a debounced search could shrink it out from under a
  scrolled down reader.
- Covered by unit tests (`frontend/tests/lib/screeningsUrlState.test.ts`,
  `frontend/tests/hooks/useScreeningsUI.test.ts`) and verified live in the
  browser: SSR of the default and filtered views, filter-apply-then-back,
  pagination, and the scroll-position edge cases above.

## Frontend / SEO

Scope: `frontend/` (Next.js app) and general site discoverability. See
`docs/seo-hub-pages.md` for the full requirements and design notes behind
the hub page items below (SEO-7, SEO-8, SEO-9, SEO-10; SEO-3 covered the
same "hub page" need for the homepage itself and is now done, above).

### Done

#### Rebuild screening structured data around ScreeningEvent

Shipped in `frontend/app/films/[id]/page.tsx`, with `cinema.website` plumbed
through `backend/src/models/films.js` and `frontend/app/lib/films.ts`.

- Switched the per showtime JSON-LD block from the generic `Event` type to
  schema.org's `ScreeningEvent` type, with a nested `workPresented` Movie
  object linking each showtime back to the film being shown. This matches
  how venues such as Rio Theatre mark up their own pages.
- Filled in the five fields Google Search Console flagged as missing:
  `organizer.url` (from `cinema.website`), `offers` (URL only, see item
  SEO-1 below), `image`, `description`, and `performer` (cast members, not
  the director).
- Added `Movie.actor` and `Movie.sameAs` (an IMDb link), using data the app
  already fetched but never used.
- Verified with Google's Rich Results Test. Zero errors, and the nested
  `workPresented`, `performer`, and `offers` fields all parsed correctly.

#### Make homepage pagination controls use real, numbered links

Shipped in `frontend/components/screenings/Pagination.tsx`, with a new
`total` count from `backend/src/models/screenings.js`'s `fetchScreenings`
(a `prisma.screening.count({ where })` alongside the existing `findMany`,
sharing the same filter clause) plumbed through
`backend/src/controllers/screeningsController.js` and
`frontend/app/lib/screenings.ts`'s `ScreeningsResponse`.

- Went further than the original problem statement: instead of just making
  "previous"/"next" real links, added actual page number links (with an
  ellipsis for long runs, via the pure `frontend/lib/pagination.ts`
  helper), now that a real page count is available.
- Every page link (numbers, previous, next) is a `next/link` `Link` with a
  real `href`, verified present in the server rendered HTML with `curl`
  (not only reachable after client side JS runs).
- A plain click still intercepts the link for the app's own scroll-to-table
  and transition-pending handling; a modified click (cmd/ctrl-click, middle
  click) is left alone so "open in new tab" and similar still work.
- Pagination is hidden entirely when there is only one page.

#### SEO-3. Server render the homepage now playing list

Shipped per `docs/specs/homepage-ssr.md`, on top of FE-1's Server Component
conversion of `frontend/app/page.tsx`.

- Added `generateMetadata`: falls through to the root layout's static
  title/description for the plain default view, and builds a dynamic
  title/description naming the active filter otherwise (a named cinema, via
  a new `getCinemasServerSide` in `frontend/app/lib/cinemas.ts`; a search
  term; a date/range; or a page number beyond 1).
- Added `ItemList` structured data for the current page's screening list
  (`NowPlayingStructuredData`), deduped by film, reusing the same fetch the
  page body already made. Each entry's `item` is a `Movie` (director, genre,
  rating, etc.), matching the fuller schema already on the film's own page,
  not a bare name/url pair.
- Added `noindex` (`shouldNoindex`) for a search term or a date/date-range
  filter, and skip emitting the structured data at all in that case (Google
  doesn't process structured data on a page it isn't indexing) — these
  aren't stable, searched-for pages the way a named-cinema filter is: `q`
  is arbitrary typed text, and a specific day's listing goes stale within
  24 hours. Matches Google's own guidance for internal search-results-style
  pages: `noindex` the page, but still `follow` its links to the real film
  pages.
- Found and fixed two canonical-URL bugs along the way, one specific to
  this page and one pre-existing and site-wide: Next.js's
  `alternates.canonical` in the Metadata API silently strips a URL's query
  string, so a per-filter canonical needed a manually rendered
  `<link rel="canonical">` tag instead (a supported Next.js pattern — it's
  still hoisted and deduped into `<head>`); separately, the root layout's
  static `alternates.canonical: SITE_URL` had been applying to every route
  without its own override, so `/about` and similar pages were pointing
  their canonical at the homepage. Removed that blanket default; a page
  with no canonical tag is a safe, neutral state.
- Confirmed the shared server side fetch already uses `cache: 'no-store'`,
  from the original FE-1 work.
- Verified with `curl` against a local dev server across the default view,
  a cinema filter, a search term, `page=2`, and an invalid date range.
  Google's Rich Results Test itself needs a public URL — still to run once
  deployed.

### Still deferred

---

#### SEO-1. Add real ticket price and availability to offers

**Problem:** The `offers` field in each ScreeningEvent currently carries
only a `url`, not `price` or `availability`.

**Impact:** This is deliberate. The site does not scrape real ticket price
or inventory per showtime. Venues such as Rio link out to a separate
ticketing domain, for example riotheatretickets.ca, that is not currently
captured. Fabricating these fields would produce inaccurate structured
data.

**Approach:** Add ticket URL and price scraping to the relevant scrapers,
then populate `offers.price` and `offers.availability` from real data.

**Priority:** Low. Blocked on new scraping work.

---

#### SEO-2. Add dedicated cinema landing pages

**Problem:** There is no page such as `/cinemas/[id]` for an individual
venue.

**Impact:** Searches like "Rio Theatre showtimes" have no dedicated page on
the site to rank for, even though the underlying data already exists:
`cinema.name`, `cinema.website`, `cinema.address`, and screenings
queryable by `cinema_id`.

**Approach:** Build a landing page per cinema using existing data, and mark
it up with schema.org's `MovieTheater` type, which is more specific than
the generic `Organization` type used today.

**Priority:** High. This is the biggest gap, and the data is already
available.

---

#### SEO-4. Link related films from each film detail page

**Problem:** Film detail pages do not link to related content, such as
other films by the same director, other films at the same cinema, or films
in a similar genre.

**Impact:** This limits internal linking, which search engines use to
understand topic relationships. It also limits on site engagement signals
such as pages per session and time on site.

**Approach:** Add a related films section to
`frontend/app/films/[id]/page.tsx`, sourced from existing director,
cinema, and genre fields.

**Priority:** Medium.

---

#### SEO-5. Expand sitemap coverage

**Problem:** `sitemap.ts` only includes films that currently have an
upcoming screening, capped at 500 films through
`/api/screenings?limit=500`. Films with no upcoming screenings are left
out, and any future cinema or hub pages would be left out too.

**Impact:** Some valid, indexable pages are never listed for search engines
to discover through the sitemap.

**Approach:** Include films without upcoming screenings, raise or remove
the 500 item cap, and add cinema and hub page routes once SEO-2 and SEO-7
exist.

**Priority:** Low to medium. Depends on SEO-2 and SEO-7.

---

#### SEO-6. Add FAQ structured data

**Problem:** There is no `FAQPage` structured data anywhere on the site for
common questions, such as ticket prices, where to buy tickets, or parking.

**Impact:** Low effort, incremental SEO gain.

**Approach:** Best done once SEO-2 (cinema pages) exists, since that is the
natural place to host venue specific questions and answers.

**Priority:** Low.

---

#### SEO-7. Add tag based hub pages

**Problem:** `screening.tags` already holds a clean set of event style
values produced by the AI title cleaning step in `load_json.py`, for
example `Q&A`, `Director in attendance`, `Live music`, and
`4K restoration`. There is no page that aggregates screenings by these
tags.

**Impact:** These tags capture search intent specific to arthouse
audiences, such as wanting a Q&A screening or a live scored film, that a
mainstream cinema listing site would not serve. Unlike genre or director,
this data already exists in a clean, low effort form.

**Approach:** Group the raw tag values into a small set of canonical
categories before building pages, for example Q&A and filmmaker presence,
restoration and print format, live accompaniment, and milestone
screenings. Do not build a dedicated page per `Hosted by <name>` value,
since those identify a specific host rather than a repeatable category.
Full grouping proposal and open questions on URL structure are in
`docs/seo-hub-pages.md`.

**Priority:** High. Best supported new hub page direction found so far.

---

#### SEO-8. Treat genre as a homepage filter, not a dedicated page, for now

**Problem:** `film.genre` is a raw, comma separated string copied from
OMDb, and sometimes the literal value `N/A`. Among films currently
showing, most genres have exactly 1 film, with `Documentary` and `Drama`
at 3 films each.

**Impact:** A dedicated genre page would be thin today. Genre is still a
real, recurring category that should accumulate volume over time, unlike
director (see SEO-9).

**Approach:** Parse and clean `film.genre` into a proper list, and surface
it as a filter on the homepage rather than as dedicated URLs for now.
Revisit dedicated genre pages once simultaneous inventory across venues
grows enough that a genre page would realistically list more than 2 or 3
films.

**Priority:** Medium.

---

#### SEO-9. Do not build director hub pages

**Problem:** Nearly every director with a film currently showing has
exactly one film showing at any given time.

**Impact:** A per-director page would almost always just repeat that
film's own detail page with no added content. This is a structural
property of a small, 3 venue aggregator, not a data gap that scraping or
enrichment can fix.

**Approach:** None planned. This is a decision to not build the feature,
recorded here so it is not re-proposed without re-deriving this reasoning.
Revisit only if a venue runs something like a full director retrospective
with several films from the same person scheduled at once.

**Priority:** Dropped.

---

#### SEO-10. Add country and language hub pages

**Problem:** `film.country` and `film.language` exist but are sparse and
inconsistent. Several currently showing films have `null` or `N/A` in
these fields.

**Impact:** Same category of idea as genre pages, for example "Japanese
films playing in Vancouver," but with thinner and less consistent data
right now.

**Approach:** Revisit after the genre (SEO-8) and tag (SEO-7) work ships,
and after data quality for `country` and `language` improves.

**Priority:** Low.

---

#### SEO-11. Add a trending or most watchlisted page

**Problem:** There is no page ranking screenings by how many users have
saved them.

**Impact:** `watchlist_screening` currently has 17 rows in total, and the
most saved film has exactly one save. Not enough signal yet to rank
anything as trending without it reflecting noise rather than real
interest.

**Approach:** Revisit once the site has enough registered users and
watchlist activity for a ranking to be meaningful.

**Priority:** Blocked. Depends on user growth, not on engineering work.
