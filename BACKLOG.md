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

#### FE-2. Adopt Base UI (not shadcn) for interactive components (pilot: MustSeesMenu)

The nav bar's hover/click menu into `/whats-on/*` hub pages
(`frontend/components/MustSeesMenu.tsx`, see SEO-13) was originally
hand-rolled and was missing real keyboard navigation, focus management,
and the WAI-ARIA navigation-menu pattern — it also needed a manually
positioned portal to avoid being clipped by NavBar's `overflow-x-auto`
pill row, and a hand-timed "hover intent" delay to avoid closing itself
when the pointer crossed into the (now non-child, portaled) panel.

**Tried `npx shadcn@latest add navigation-menu` first, then backed that
part out.** shadcn generates a wrapper component styled with its own
default Tailwind classes and a separate visual language from this
project's existing hand-rolled components — adopting it would have mixed
"fix the interaction/accessibility gap" with "change the visual design,"
which are separate decisions (see the broader-adoption note below). It
also required an `init` step that collided with this project's own CSS
variable names and briefly broke things — full incident writeup in
`TROUBLESHOOTING.md`.

**What shipped instead:** `frontend/components/MustSeesMenu.tsx` imports
`@base-ui/react/navigation-menu` directly — the headless primitives
library shadcn's generated component was itself built on — and styles it
by hand with this project's own existing Tailwind tokens and component
conventions. This gets the interaction/accessibility fix with none of the
visual-language mismatch: verified live, Tab moves focus from the trigger
into the panel's links, Escape closes the panel and returns focus to the
trigger, and `keepMounted` on `NavigationMenu.Content` keeps the link in
the initial server rendered HTML (confirmed with `curl`) without a
hand-rolled duplicate-render workaround. `shadcn`,
`class-variance-authority`, `cn`, `lucide-react`, and `tw-animate-css`
(all shadcn-ecosystem-specific, not needed to use Base UI directly) were
installed during the aborted attempt and have been uninstalled;
`@base-ui/react` is the only new dependency that remains.

**Found and fixed three visual mismatches after the initial pass**,
caught by re-reviewing against the rest of the site rather than this
component in isolation:

- The trigger had an extra `rounded-btn` corner radius that "My
  Watchlist"/"About" (the other pills in the same row) don't have.
  Removed it to match them exactly (confirmed `0px` on both via
  `getComputedStyle`).
- The popup rendered in the wrong font (`Arial` instead of `Noto Sans`).
  `NavigationMenu.Portal` renders into `document.body`, outside
  `NavBar.tsx`'s `<header className={noto.className}>` wrapper, so the
  portaled content never inherited that font class — confirmed with
  `getComputedStyle` before and after. Fixed by re-instantiating the same
  `Noto_Sans(...)` call (this project's existing per-file convention, not
  a shared fonts module) and applying it directly to the portaled
  content. Worth remembering for any future portaled component: a portal
  escapes CSS inheritance from its DOM ancestors generally, not just
  `overflow`/clipping — anything the ancestor tree provides (fonts,
  CSS custom property scoping, etc.) needs to be reapplied explicitly.
- The popup's shadow (`shadow-lg`, a generic Tailwind preset) didn't match
  this codebase's other small anchored popover
  (`ScreeningDateInput.tsx`'s date picker, `shadow-[0_12px_28px_rgba(0,0,0,0.12)]`).
  Matched it exactly instead of inventing a new value.

**Scope of this item is deliberately narrow — one pilot component, no
visual changes anywhere else.** Whether to adopt Base UI (or shadcn, or
anything else) more broadly for `Button`/`Card`/`Input`/the sign-in modal,
as part of a real visual design pass, is a separate, larger, not-yet
-decided question. Revisit once this component has been live a while.

**Priority:** Done for the pilot. Broader adoption: unscheduled, pending
a decision on visual direction.

---

## Frontend / SEO

Scope: `frontend/` (Next.js app) and general site discoverability. See
`docs/seo-hub-pages.md` for the full requirements and design notes behind
the hub page items below (SEO-7, SEO-9, SEO-10; SEO-3 covered the
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

#### SEO-13. Add a Top Rated Screenings hub page

Shipped at `/whats-on/top-rated` (`frontend/app/whats-on/top-rated/page.tsx`).
This replaced SEO-7's tag based hub page as the new hub page direction —
see SEO-7 below for why tags turned out not to support one.

- Data investigation before building anything: checked the currently
  upcoming catalog (249 distinct films) for `imdb_rating >= 8.0` — 14
  qualify, 5 of which have a screening within the next 7 days. Real,
  usable numbers, unlike tags (see SEO-7) or "new release by year" (also
  considered; shelved — 71% of the current catalog is a 2025/2026 title,
  which doesn't discriminate anything, though this may just be VIFF
  festival season temporarily skewing that number; worth re-checking
  outside festival season).
- One page, not two: originally considered separate "this week" and "this
  month" pages, but the this-week list is always a strict subset of the
  this-month list (same ranking, tighter date cutoff) — as two separate
  indexable URLs, the "this week" page would carry zero content not also
  on the "this month" page. Combined into one page instead: `PosterCarousel`
  highlights the this-week subset, `PosterGrid` lists the full this-month
  set below it — both `frontend/components/whats-on/`, sharing one
  `FilmPosterCard`.
- Selection logic (`frontend/lib/topRated.ts`, `selectTopRated`) is pure
  and unit tested (`frontend/tests/lib/topRated.test.ts`): dedupes a film
  down to its soonest upcoming showtime, ranks by rating then title, caps
  at `TOP_RATED_MAX_FILMS` (20).
- The backend caps `limit` at 200
  (`backend/src/validators/screeningsValidators.js`), under this catalog's
  current ~500 total upcoming screenings, so the page fetches
  `sort=imdb&order=desc&limit=200` rather than trying to fetch
  "everything": sorting by rating first guarantees every screening
  belonging to a qualifying film lands within the cap regardless of
  catalog size, since only the relatively few high-rated films' rows need
  to fit.
- Added `poster_path` (as a derived `poster_url`, reusing
  `backend/src/models/films.js`'s TMDB image URL builder, now shared via
  `backend/src/utils/posterUrl.js`) to `/api/screenings`'s response — it
  had never been exposed there before, only on the film detail endpoint.
  Also improves the homepage's own `ItemList` structured data, which
  picked up `image` on every entry for free.
- Extracted the homepage's structured data builder into
  `frontend/app/lib/structuredData.tsx` so both pages share one `Movie` +
  `ItemList` schema instead of two copies drifting apart.
- Added to `frontend/app/sitemap.ts`, which also surfaced and fixed an
  unrelated, real bug — see SEO-5 above.

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
`frontend/app/films/[id]/page.tsx`, ranked by director match, then genre,
then cinema, each ranked by soonest upcoming screening — not a general
recommendation engine; the catalog size (236 active films) doesn't
justify embeddings or collaborative filtering. Full data investigation,
design decisions, and task breakdown are in
`docs/specs/related-films.md`.

**Priority:** Medium.

---

#### SEO-5. Expand sitemap coverage

**Problem:** `sitemap.ts` only includes films that currently have an
upcoming screening. Films with no upcoming screenings are left out.

**Fixed already, found while adding the Top Rated hub page's route:** the
sitemap's single `/api/screenings?limit=500` call was silently returning
zero film routes, not just capping at 500 — the backend validator
(`backend/src/validators/screeningsValidators.js`) caps `limit` at 200, so
that request always failed validation, `!res.ok` was true, and the catch-all
fallback returned only the static routes with no visible error. Fixed by
paginating with the response's own `total` instead of one fixed-size
request. `curl localhost:3000/sitemap.xml` now lists all ~249 current film
routes instead of 0.

**Still open:** films with no upcoming screenings are still excluded, and
any future cinema landing pages (SEO-2) would need adding too. The Top
Rated hub page (see the new item above SEO-7) is already included.

**Priority:** Low to medium for the remaining scope. Depends on SEO-2.

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

**Reassessed, deferred (not dropped):** Checked the actual data before
building anything. Two problems, not one:

1. Volume right now is much thinner than the original data check found:
   only 4 upcoming screenings have any tag at all (vs. ~10-20 tagged
   screenings/month historically) — future screenings just haven't been
   through the same tagging/enrichment pass yet as they get closer to
   their date.
2. More importantly, tag coverage is not evenly spread across venues: of
   174 tagged screenings all-time, 155 (89%) are from Rio Theatre alone;
   the next largest venue (VIFF Centre) accounts for 16, and every other
   venue (including The Cinematheque) has 0-1. A "Q&A screenings in
   Vancouver" page built from this data would really be "Rio Theatre's own
   event calendar" wearing a general-aggregator label — a real accuracy
   problem, not just a volume one, and not one that fixes itself as more
   future screenings get tagged unless other venues start tagging their
   own listings as consistently as Rio Theatre does.

Revisit if venues besides Rio Theatre start consistently marking up these
event types. Do not build per-`Hosted by <name>` pages regardless (see the
original Approach below) — those were already known to be too thin, same
reasoning as SEO-9's dropped director pages.

**Approach (if revisited):** Group the raw tag values into a small set of
canonical categories, for example Q&A and filmmaker presence, restoration
and print format, live accompaniment, and milestone screenings. Full
grouping proposal and open questions on URL structure are in
`docs/seo-hub-pages.md`.

**Priority:** Deferred. See SEO-13 above for the hub page direction that
replaced this one.

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

**Problem:** Re-checked against the 228 films with an upcoming active
screening (2026-10-05; re-run this check if revisiting much later):
`country` is usable (non-null, non-"N/A") on 141/228 (61.8%), `language`
on 130/228 (57.0%) — both films are originally reported as "sparse and
inconsistent," but that was a qualitative impression, not a measured
number; at today's actual coverage this is the same order of magnitude as
genre's own 61% match rate, which was already judged good enough to build
SEO-4's related-films feature on. Data quality is no longer the blocker.

**Impact:** Same category of idea as genre pages ("Japanese films playing
in Vancouver"), and the volume distribution has the same shape genre's did
(see SEO-4/`docs/specs/related-films.md`'s Jaccard-similarity story): the
most common values are too common to be a distinctive hub page, and most
other values are too thin to justify one at all. By language: English 76
(too broad), French 19, Japanese 11, Spanish 11, German 10 (viable), then
a long tail of 1-4 each (too thin). By country: United States 44 (too
broad), France 32, United Kingdom 19, Canada 17, Germany 15, Japan 13
(viable), then Belgium 9 and below (too thin). A handful of hub pages for
the mid-volume values is viable; one page per *every* distinct value is
not.

**Approach:** Same pattern as SEO-13's Top Rated hub: one static list of
which country/language values get a page (the mid-volume ones identified
above, re-checked at build time rather than assumed from this snapshot),
each rendered with the existing `PosterGrid`/`PosterCarousel` +
`ItemListStructuredData` components, filtering `fetchScreenings`'s result
set by the matching `country`/`language` token. Needs its own design pass
on: whether country and language are one hub type or two, the URL
structure per value, and how a value earns a page (a fixed threshold
re-checked periodically, vs. a hardcoded list) — not yet decided, write a
spec before building, matching this project's own convention.

**Priority:** Medium (up from Low) — the data-quality blocker this was
waiting on is resolved; what's left is a scope/design decision, not a data
problem.

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
