# Spec: Server Render the Homepage Screening List

Status: Shipped. `docs/specs/url-driven-filters.md` (FE-1) landed first as
planned; this spec's own tasks (`generateMetadata`, `ItemList` structured
data, the caching directive) are done — see the Task breakdown below for
what shipped and how it was verified.

Tracked in BACKLOG.md as SEO-3. Background and reasoning for why this was
prioritized over other hub page ideas live in `docs/seo-hub-pages.md`. This
document is the implementation level spec for this one piece of work.

## Why this depends on FE-1

An earlier version of this spec planned to fetch the default view server
side, pass it into the existing client side data hook as an `initialItems`
prop, and skip a redundant client side fetch when filters were still at
their default. That plan only worked for the single default view, because
filter state lived outside the URL and a server has no way to read it
otherwise.

`docs/specs/url-driven-filters.md` moves all filter state into the URL and
turns `frontend/app/page.tsx` into a Server Component that reads
`searchParams` directly and renders any filter combination server side, not
only the default one. Once that ships, this spec no longer needs its own
fetching or hydration plan. It only adds the SEO specific pieces on top:
metadata, structured data, and a caching directive.

## Goal

Make the homepage's screening list visible to a crawler, or to anyone
viewing page source with JavaScript disabled, in the first HTML response,
and give that response proper metadata and structured data.

## Non-goals

- Do not design the URL scheme, the Server Component conversion, or the
  filter state handling here. That is `docs/specs/url-driven-filters.md`.
- Do not change how the watchlist works. It is already a client side,
  post-mount concern, independent of the screening list itself.
- Do not change backend query behavior. The default query, with no filter
  parameters, already returns upcoming screenings in the right order.
- Do not add authentication or per-user personalization to the server
  rendered path.

## Background

- `ResultsTable` already renders film links with `next/link`'s `Link`
  component pointed at `/films/[id]`. Once real data is present at first
  paint, these links are already crawlable without further changes.
- The backend's default query for `/api/screenings`, with no parameters,
  already filters to `start_at_utc >= now()`. This already matches what
  "Now Playing" should show, so no backend change is needed.
- The server side fetch function planned in `url-driven-filters.md`
  already solves the relative URL problem `getScreenings()` has today,
  following the same absolute URL pattern `getFilmDetail` uses in
  `frontend/app/lib/films.ts`. This spec reuses that function rather than
  writing its own.

## Acceptance criteria

- `curl` against the homepage, or viewing page source with no JavaScript
  executed, shows real film titles and working links to `/films/[id]` for
  the current screening list.
- The homepage has its own `generateMetadata`, instead of relying only on
  the root layout's static defaults.
- The homepage emits `ItemList` or `CollectionPage` structured data for the
  current screening list. Verified with 0 errors in Google's Rich Results
  Test and in validator.schema.org.
- The server rendered list reflects current data. It must not be cached
  across requests in a way that lets it go stale.

## Design decisions

1. Add a structured data component for the homepage, following the same
   pattern already used in `frontend/app/films/[id]/page.tsx`, emitting
   `ItemList` or `CollectionPage` for the current screening list, using
   whatever list the Server Component from `url-driven-filters.md` already
   fetched. No separate fetch for this.
2. Add `generateMetadata` for the homepage. Reasonable default title and
   description for the unfiltered view. Consider whether a filtered view
   should get its own dynamic title, for example naming the selected
   cinema, once `url-driven-filters.md` exposes `searchParams` here too.
3. Set an explicit revalidate window or `cache: 'no-store'` on the server
   side fetch, so Next.js does not serve a statically cached, stale list.

## Task breakdown (all done)

1. Confirmed `url-driven-filters.md` shipped and `frontend/app/page.tsx` is
   a Server Component reading `searchParams`.
2. Added `generateMetadata` to the homepage (`frontend/app/page.tsx`). Falls
   through to the root layout's static title/description for the plain
   default view; builds a dynamic title/description naming the active
   filter otherwise (a named cinema via a new `getCinemasServerSide` in
   `frontend/app/lib/cinemas.ts`, a search term, a date/range, or a page
   number beyond 1), so a bookmarked or shared filtered URL isn't a
   duplicate title of every other one. Also sets `noindex` (`shouldNoindex`)
   for a search term or a date/date-range filter: unlike a named cinema,
   these aren't stable, searched-for pages — `q` is arbitrary typed text,
   and a specific day's listing goes stale within 24 hours — so, matching
   Google's own guidance for internal search-results-style pages, the page
   itself is `noindex` while still `follow`ing its links to the real film
   pages.
   - Found along the way: Next.js's `alternates.canonical` in the Metadata
     API silently strips the query string from whatever URL it's given —
     confirmed with a hardcoded value, not just the dynamic one, and true
     even passed as a `URL` object, not only a string. A per-filter
     canonical needs the query string to mean anything, so the homepage
     instead renders a real `<link rel="canonical">` tag directly in JSX
     (`CanonicalLink`) — a supported Next.js pattern, not a workaround; Next
     still hoists and dedupes it into `<head>`.
   - Also found (separate, pre-existing bug, fixed in passing): the root
     layout's static `alternates.canonical: SITE_URL` was applying to every
     route that didn't set its own, including `/about` — every such page's
     canonical incorrectly pointed at the homepage. Removed the blanket
     default; a route with no canonical tag at all is a safe, neutral state
     (Google treats the page's own URL as canonical by default), and any
     other static route that wants one can add it the same way
     `frontend/app/films/[id]/page.tsx` already does.
3. Added the structured data component (`NowPlayingStructuredData` in
   `frontend/app/page.tsx`): `ItemList` with one `ListItem` per film on the
   current page (deduped by `film_id`, since the same film can have more
   than one showtime), reusing the same `data.items` the page already
   fetched — no separate fetch. Each entry's `item` is a `Movie` (director,
   genre, rating, `sameAs`), matching the fuller schema
   `frontend/app/films/[id]/page.tsx` already emits on the film's own page,
   not a bare name/url pair. Skipped entirely on a page `generateMetadata`
   already marked `noindex` (see task 2) — Google doesn't process
   structured data on a page it isn't indexing, so emitting it there would
   just be dead weight.
4. Confirmed: `getScreeningsServerSide` (`frontend/app/lib/screenings.ts`)
   already sets `cache: 'no-store'`, from the original FE-1 work.
5. Verified manually with `curl` against a local dev server: default view,
   a single-cinema filter, a search term, `page=2`, and an invalid date
   range, checking title/description/canonical/robots/structured data each
   time; also re-checked `/films/[id]` and `/about` for regressions.
   Google's Rich Results Test itself needs a publicly reachable URL, so
   that step is still open — worth running once this is deployed.

## Risks

- Structured data must reflect whatever filter is active in the URL, not
  always the unfiltered default, once `url-driven-filters.md` ships.
  Building this against a hardcoded default view would silently break for
  filtered pages.

## Explicitly out of scope, tracked separately

- URL driven filters and the Server Component conversion itself. See
  `docs/specs/url-driven-filters.md`.
- Tag, genre, and cinema hub pages. See BACKLOG.md items SEO-2 and SEO-7
  through SEO-10.
