# Spec: Related Films on the Film Detail Page

Status: Implemented. Originally shipped as a director > genre > cinema
priority-bucket design (see git history); revised to the weighted-scoring
design below after the bucket approach produced visibly weak matches in
production (e.g. a documentary surfacing as "related" to a 1965 drama
purely because both happened to share the single word "Drama" in a
multi-tag genre field).

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

1. **Rule-based matching only, but as a weighted similarity score across
   five signals, not a director > genre > cinema priority order.** The
   original v1 shipped as strict buckets (fill every director match before
   looking at genre, etc.), which let a single bucket fully decide the
   result regardless of how many signals two films actually shared — e.g.
   a documentary with no other relation to a target film still outranked
   genuinely similar films, purely because it matched the broad "Drama"
   genre token and the bucket order never looked past that. The revised
   design scores every candidate once, summing:
   - shared directors (weight 3 per person) and shared cast (weight 1 per
     person) — counted, not just present/absent, so two shared cast
     members score higher than one
   - genre, country, and language overlap (weights 2, 1, 1) — each as
     Jaccard similarity (intersection / union) of the two films' token
     sets, not "any token in common," so sharing one of four genres counts
     for less than sharing both of two
   - a flat same-cinema bonus (weight 0.5) — intentionally the smallest
     signal, since it's about logistics ("also playing near you"), not
     content similarity; its job is to guarantee almost every film has
     *something* to show (99% cinema-match coverage), not to rank highly
     on its own
   Director outweighs cast because directorial voice carries more of a
   film's identity than any one performance; weights are a judgment call,
   not derived from any ground truth — revisit if matches still look off.
2. **Rank by total score, descending; break ties by soonest upcoming
   screening date, then by higher `imdb_rating`.** Soonest-first within a
   tie keeps the original principle ("films you could actually go see
   soon," matching SEO-13's Top Rated page) as the tiebreaker once score
   can't distinguish two candidates, rather than as the primary sort key.
3. **Cap at 10 related films total**, taking the top-scored candidates
   with score > 0. Presented as a horizontally scrollable strip
   (`PosterCarousel`), the same "this week" component Top Rated uses,
   rather than a wrapping grid — a fixed grid reads oddly at 10 items,
   where a scroll-snap strip the reader controls themselves scales to any
   count without a layout the page has to plan around.
4. **A film with zero signal overlap with every other currently screening
   film (including no shared cinema — i.e. it has no upcoming screening of
   its own) simply omits the section.** No placeholder content, no generic
   "browse all films" fallback — consistent with how `PosterCarousel`/
   `NowPlayingStructuredData` already handle an empty list elsewhere in
   this codebase.
5. **Reuse the existing structured data helpers**
   (`frontend/app/lib/structuredData.tsx`'s `buildItemListSchema`/
   `buildMovieEntity`, built for SEO-13) for the related films list,
   rather than inventing a parallel schema. This is additive to the film
   detail page's own existing `Movie`/`ScreeningEvent` JSON-LD, not a
   replacement for it.
6. **Reuse `FilmPosterCard` and `PosterCarousel`**
   (`frontend/components/whats-on/`, built for Top Rated) for the visual
   presentation, for consistency with the one other place this codebase
   already shows a scrollable strip of film posters.

## Acceptance criteria

- A film detail page with at least one scoring signal in common with
  another currently screening film shows a related-films section linking
  to the top-scored matches, ranked per the Design decisions above, capped
  at 10.
- A film with zero signal overlap with every other film renders the page
  with no related-films section — not an empty heading, not an error.
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
3. ~~Extract the pure ranking/bucketing logic into its own testable
   function, the same way `frontend/lib/topRated.ts`'s `selectTopRated`
   was split out from the page that uses it.~~ Deviated: the scoring logic
   lives server-side in `getRelatedFilms` (`backend/src/models/films.js`)
   instead, matching the backend's own convention of unit-testing query +
   business logic together with a mocked Prisma client (see
   `fetchScreenings`) — it needs direct DB access per candidate (director/
   cast ids, genre/country/language, cinema overlap), which doesn't fit a
   frontend-only pure function. Covered directly by
   `backend/tests/models/films.test.js`.
4. Add the related-films section to
   `frontend/app/films/[id]/page.tsx`, rendering `FilmPosterCard`s and
   the reused `ItemListStructuredData`.
5. Verify live: `curl` for crawlability, Google's Rich Results Test for
   the added structured data, and a visual check on both a film with
   several related matches and (if still reachable in the live data) the
   one film with none.

## Risks

- The weights (3 / 1 / 2 / 1 / 1 / 0.5) are a reasoned judgment call, not
  fit to any ground truth — there's no labelled "these films are actually
  similar" dataset to validate against. If matches still look consistently
  off for some genre or catalog segment, revisit the weights first before
  assuming the scoring approach itself is wrong.
- Every score query runs over the full pool of currently active, upcoming
  screenings (no longer scoped by bucket), computed fresh on every film
  detail page request. Fine at this catalog's current size (~230 active
  films); if the catalog grows substantially, this is the first place to
  add caching.
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
