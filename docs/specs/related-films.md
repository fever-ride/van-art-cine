# Spec: Related Films on the Film Detail Page

Status: Draft, not yet implemented.

Tracked in BACKLOG.md as SEO-4. Background on why this sits in the broader
hub-pages/SEO initiative, and the data investigation behind the design
decisions below, also lives in `docs/seo-hub-pages.md`.

## Goal

Every film detail page (`frontend/app/films/[id]/page.tsx`) links to other
currently screening films related to it, so a visitor has somewhere to go
next and search engines have more internal links to understand topic
relationships between pages on this site.

## Non-goals

- Not a general-purpose recommendation engine. No embedding-based content
  similarity, no collaborative filtering. See Background for why neither
  is justified at this catalog's current size.
- Not personalized. Every visitor to a given film's page sees the same
  related films; there is no per-user signal involved.
- Does not touch the homepage's own filters or any hub page (SEO-2,
  SEO-7, SEO-13). This is scoped to the film detail page only.
- Does not change the film detail page's existing `Movie`/`ScreeningEvent`
  structured data — this adds to that page, it doesn't revise it.

## Background

Checked against the 236 distinct films with an upcoming active screening
(2026-10-04, same dataset and methodology as SEO-13's Top Rated
investigation — query the live data again if revisiting this later,
rather than trusting these numbers indefinitely):

| Relation | Films with ≥1 match | Share |
|---|---|---|
| Same director | 21 / 236 | 9% |
| Same cinema | 234 / 236 | 99% |
| Same genre (any overlapping token) | 143 / 236 | 61% |
| Any of the three | 235 / 236 | 99.6% |

Two richer approaches were considered and rejected for this catalog size:

- **Embedding-based content similarity** (vector search over plot/cast
  text): the nuance this adds over simple attribute matching isn't
  justified at ~236 active films. This is the kind of investment that
  pays off at a much larger catalog, not here.
- **Collaborative filtering** ("people who watchlisted this also
  watchlisted..."): not viable. `watchlist_screening` has only 17 rows
  total across the whole site — the same reason SEO-11's trending page is
  blocked.

Director matching is rare (9%) but, per SEO-9's own reasoning, the
rarity is structural: this site typically shows one film per director at
a time. When it does fire, it's a strong, specific signal — worth
checking first, even though it will stay rare.

## Design decisions

1. **Rule-based matching only, in this priority order: same director,
   then same genre, then same cinema.** Director first because it's the
   rarest and most specific signal; cinema last because it's nearly
   universal (99%) and the least specific — "also plays at the
   Cinematheque" says little about similarity on its own, but is worth
   having as a fallback so nearly every film has *something* to show.
2. **Rank candidates within and across these buckets by their own
   soonest upcoming screening date, ascending — not alphabetically.**
   The point is "films you could actually go see soon," the same
   principle behind SEO-13's Top Rated page — not an abstract catalog
   relationship to a film that may not even be running anymore. Break an
   exact tie (two candidates with the identical soonest screening
   timestamp) by higher `imdb_rating` first — data already on hand from
   the Top Rated work, no new source needed, and a reasonable standard
   secondary signal once the primary "soonest" ordering can't distinguish
   two candidates.
3. **Cap at 6 related films total**, filling from the priority order
   above (all director matches first, then genre, then cinema) until the
   cap is reached or every source is exhausted. A 2x3 or 3x2 grid, matching
   the poster-grid layout already established for Top Rated.
4. **A film with no match via any of the three relations (currently 1 of
   236) simply omits the section.** No placeholder content, no generic
   "browse all films" fallback — consistent with how `PosterCarousel`/
   `NowPlayingStructuredData` already handle an empty list elsewhere in
   this codebase.
5. **Reuse the existing structured data helpers**
   (`frontend/app/lib/structuredData.tsx`'s `buildItemListSchema`/
   `buildMovieEntity`, built for SEO-13) for the related films list,
   rather than inventing a parallel schema. This is additive to the film
   detail page's own existing `Movie`/`ScreeningEvent` JSON-LD, not a
   replacement for it.
6. **Reuse `FilmPosterCard`** (`frontend/components/whats-on/`, built for
   Top Rated) for the visual presentation, for consistency with the one
   other place this codebase already shows a small grid of film posters.

## Acceptance criteria

- A film detail page with at least one related film (by director, genre,
  or cinema) shows a related-films section linking to those films, in
  the priority order and soonest-screening ranking above, capped at 6.
- A film with no matches via any relation renders the page with no
  related-films section — not an empty heading, not an error.
- Every related-film link is a real `<a href>` present in the initial
  server rendered HTML (verified with `curl`, not just reachable after a
  click), consistent with the rest of this project's SEO work.
- The related films list's structured data validates with 0 errors in
  Google's Rich Results Test / validator.schema.org, and does not
  conflict with or duplicate the page's existing `Movie`/`ScreeningEvent`
  markup.
- The film detail page's existing structured data and layout are
  unchanged other than the new section's addition.

## Task breakdown

1. Add a query to `backend/src/models/films.js` (or a new function
   alongside it) that, given a film ID, returns up to 6 related films
   ranked per the Design decisions above. Reuse the `where`-building
   patterns already established in `backend/src/models/screenings.js`
   rather than writing a parallel query style.
2. Expose it from `frontend/app/lib/films.ts`, following the same
   pattern `getFilmDetail` already uses (absolute URL fetch, `cache()`
   wrapped).
3. Extract the pure ranking/bucketing logic into its own testable
   function, the same way `frontend/lib/topRated.ts`'s `selectTopRated`
   was split out from the page that uses it — unit test it directly,
   not only through the page.
4. Add the related-films section to
   `frontend/app/films/[id]/page.tsx`, rendering `FilmPosterCard`s and
   the reused `ItemListStructuredData`.
5. Verify live: `curl` for crawlability, Google's Rich Results Test for
   the added structured data, and a visual check on both a film with
   several related matches and (if still reachable in the live data) the
   one film with none.

## Risks

- The genre bucket matches on any overlapping token from a raw,
  uncleaned, comma-separated OMDb string — occasionally a shared but very
  broad genre tag could pair two tonally unrelated films. Acceptable for
  v1: genre is already the weakest of the three signals in the priority
  order, and director/cinema are exact-ID matches with no such ambiguity.
- The "~1 film with zero matches" and the exact match-rate percentages in
  Background will drift as the catalog changes. Re-run the same check
  before trusting these numbers if this spec is revisited much later.

## Explicitly out of scope, tracked separately

- Any homepage filter or hub page work (SEO-2, SEO-7, SEO-13).

## Future directions (not now — recorded so this gets re-derived, not re-guessed)

v1 (this spec) is a simple, same-for-everyone, rule-based "related" list —
one point in a standard spectrum of "related content" approaches used
across the industry. Recording where v1 sits in that spectrum and what
the other points are, so a future revisit starts from here instead of
re-surveying from scratch:

1. **Better content similarity (still the same for every visitor).**
   Embedding-based search over plot/cast/genre text instead of exact
   attribute matching — could surface a tonal/thematic match that rule
   matching misses entirely (e.g. two unrelated-on-paper films that are
   both quiet, slow-burn character studies). Not justified at the current
   catalog size (~236 active films) — see Background. Revisit once the
   catalog is large enough that rule-based matching routinely produces
   either too many or too loosely-related candidates to rank well, not on
   a fixed timeline.
2. **Popularity-based ranking (still not personalized).** Rank or weight
   candidates by how many visitors have watchlisted/saved them, as a
   same-for-everyone "what's generally popular" signal — distinct from
   (3) below, which is per-visitor. Blocked on the same data gap as
   SEO-11's trending page: `watchlist_screening` has only 17 rows
   site-wide today, not enough to reflect real signal over noise.
3. **Personalized, based on what a signed-in visitor has watchlisted.**
   A different axis entirely from (1) and (2): not "what's this film
   similar to" or "what's generally popular" but "what would *this
   visitor* specifically want next." Same watchlist-volume blocker as (2).
   Also only ever applies to signed-in visitors with watchlist history, so
   even once viable, it would supplement v1's always-available rule-based
   list for everyone else, not replace it.
4. **Hybrid (combining 1-3 with weights) and editorial/human-curated
   picks** are the two remaining standard patterns in this space (what
   Netflix-scale recommenders and staffed media outlets respectively
   converge to) — named here for completeness, not under consideration:
   hybrid models need (1)-(3) to each independently exist first, and
   editorial curation needs ongoing staff time this project doesn't have.

None of (1)-(3) is a small follow-up to v1 — each is its own design
effort (and its own spec) once its blocker clears.
