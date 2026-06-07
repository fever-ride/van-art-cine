# Smart Search — Frontend Plan

## Goal

Add smart search to the homepage as a separate discovery section, not as a replacement for the existing title/filter search.

The current homepage search/filter sidebar is optimized for deterministic browsing:

- Search by film title
- Filter by cinema
- Filter by date/range
- Sort screening rows

Smart search has a different mental model: the user describes what they want, and the app returns an intent-aware answer. Keeping it separate avoids confusing the existing filtering flow and lets us introduce the feature as an exploratory discovery tool.

## Placement

Add a standalone Smart Search section on the homepage:

```text
Hero
Now Playing title
Existing filters + screenings table
Pagination
Smart Search section
Footer
```

Placement: inside the homepage main content, below the existing screenings/pagination area, above the footer.

Rationale:

- Avoids mixing natural-language search with the existing title search box.
- Keeps the existing browse workflow stable.
- Lets smart search have its own loading, empty, and result presentation states.
- Makes it easy to label as an experimental/discovery feature before production hardening.

## User-Facing UX

### Search Box

Suggested copy:

```text
Looking for something specific?
Describe the kind of film you want to watch.
```

Placeholder examples:

```text
light comedy tonight under 2 hours
dreamy melancholic romance
what's at the Rio tonight
Wong Kar-wai style
```

Behavior:

- User types a natural-language query.
- Submit via button or Enter.
- Do not run on every keystroke initially; use explicit submit to control OpenAI/API cost.
- Optional later: debounce only after usage/cost is understood.

### Result Metadata Display

Do not show raw `match_score` to normal users by default.

Reasons:

- A numeric LLM score can feel arbitrary or overly technical.
- Users may over-trust a number that is only an internal ranking signal.
- Scores are more useful for debugging/evaluation than product UX.

Do not show raw `similarity`, `lexical_rank`, or `retrieval_source` to users.

Keep these available in API responses for:

- local debugging
- eval reports
- developer-only UI
- future analytics

`match_explanation` is different. If present and high quality, it can be displayed as user-facing copy, but not as "LLM score explanation." Present it as:

```text
Why this might fit
```

Guidelines:

- Show explanation only when non-empty.
- Keep it short.
- Do not expose model/ranking internals.
- Consider hiding explanations in the first UI version and enabling them after manual review.

Recommended first version:

| Field | User-facing? | Notes |
|-------|--------------|-------|
| `match_score` | No | Developer/eval only |
| `match_explanation` | Optional | Show as "Why this might fit" only when useful |
| `similarity` | No | Developer/eval only |
| `lexical_rank` | No | Developer/eval only |
| `retrieval_source` | No | Developer/eval only |

## API Integration

Endpoint:

```text
GET /api/smart-search?q=...
```

Pass existing homepage filters only if they are part of the Smart Search section UI. Initial version can start with query-only, then add optional controls later.

Potential future query params:

- `cinema_ids`
- `date`
- `from`
- `to`
- `limit`

## Result Type Rendering

The frontend should branch by `result_type`.

### `film_results`

Used for recommendation/discovery results.

Render one card per film:

- Title + year
- Genre / metadata
- Optional "Why this might fit" explanation
- Nested showtimes list
- Ticket/source links per showtime
- Watchlist buttons per showtime if possible

This is film-first because the user asked for a recommendation.

### `screening_results`

Used for SQL-only constraint queries such as:

```text
tonight under 90 minutes
```

Render screening-level rows sorted by time:

- Time/date
- Film title
- Cinema
- Runtime
- Source link
- Watchlist action

This can reuse parts of the existing `ResultsTable` behavior, but the section should remain visually separate.

### `film_showtimes`

Used for known film queries:

```text
when is The Green Ray playing
```

Render the film as the primary entity with all matching showtimes underneath.

### `cinema_schedule`

Used for known cinema/date queries:

```text
what's at the Rio tonight
```

Render as a schedule:

- Group or order by time
- Show cinema context clearly
- Keep each screening actionable

### `person_results`

Used for known director/actor queries:

```text
Tarantino films
```

Render film-level results, emphasizing exact person/entity match rather than fuzzy recommendation.

### `empty_with_fallback`

Render the backend message.

If `fallback_available` and `fallback_hint` are present, show a CTA:

```text
Show films with a similar style?
```

The CTA can later trigger a rewritten smart search query, but the first version may simply display the hint.

## Component Plan

Suggested files:

```text
frontend/app/lib/smartSearch.ts
frontend/components/smart-search/SmartSearchSection.tsx
frontend/components/smart-search/SmartSearchResults.tsx
frontend/components/smart-search/FilmResultCard.tsx
frontend/components/smart-search/ScreeningResultList.tsx
frontend/components/smart-search/SmartSearchEmptyState.tsx
frontend/lib/hooks/useSmartSearch.ts
```

Initial implementation can be smaller:

```text
SmartSearchSection
SmartSearchResults
apiSmartSearch()
```

Then extract subcomponents once result rendering stabilizes.

## State Model

Local component state is enough for the first version:

```text
query
loading
error
result
```

Do not put smart search query into homepage URL params initially unless shareable smart-search URLs become a requirement.

## Defensive UX

Smart Search depends on backend LLM/API calls, so the frontend should make failure states explicit and cheap.

### Input Guardrails

Initial frontend should enforce:

- Non-empty query before submit.
- Reasonable max length, e.g. 300-500 characters.
- Disable submit while a request is in flight.
- Explicit submit only; no automatic request on every keystroke.

If the query is too long, show a local validation message:

```text
Please shorten your search. Try describing the film, mood, cinema, or time in one sentence.
```

### Out-of-Scope UX

If the backend later returns an out-of-scope response, show a fixed product-safe message:

```text
Smart Search can help with Vancouver indie film screenings. Try asking for a film, cinema, showtime, or movie mood.
```

Do not pass through arbitrary LLM refusal text.

### Degraded / Error UX

If the response has `X-Search-Degraded: true`, show a small notice:

```text
Smart Search is temporarily limited. Showing simpler title matches.
```

If the API fails:

```text
Smart Search is temporarily unavailable. Please try again later.
```

The existing homepage search/filter UI should remain usable even when Smart Search fails.

### Debug Metadata

Never show raw internal debug fields in normal UI:

- `match_score`
- `similarity`
- `lexical_rank`
- `retrieval_source`

If needed later, put these behind a developer-only debug toggle or local-only flag.

## Testing Plan

Unit/component tests:

- Smart Search section submits query and calls API client.
- Empty/too-long query is rejected client-side without calling API.
- Loading state renders.
- Error state renders.
- Degraded notice renders when response/header indicates degraded mode.
- `film_results` renders one film card with nested showtimes.
- `screening_results` renders screening-level rows.
- `empty_with_fallback` renders message and fallback hint.
- `match_score`, `similarity`, `lexical_rank`, and `retrieval_source` are not displayed to normal users.

Optional later tests:

- `match_explanation` renders only when present.
- Watchlist behavior works for nested showtimes.
- Cinema/date filters are passed when Smart Search grows filter controls.

## Rollout Notes

First frontend version should be conservative:

- Separate section below existing results.
- Explicit submit only.
- No raw debug scores in user UI.
- Basic support for all `result_type` values.
- Keep old search/filter behavior unchanged.

After manual testing:

- Consider moving the section higher on the page if useful.
- Consider showing explanations for complex recommendation queries.
- Consider adding a developer-only debug toggle for `match_score`, `retrieval_source`, `similarity`, and `lexical_rank`.
