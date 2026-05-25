# Smart Search — Test Plan

Covers all new/rewritten modules on the `smart-search` branch. Tests mock external dependencies (OpenAI, Prisma) unless noted otherwise.

v4.1 adds PostgreSQL full-text lexical recall to the agentic path. The evaluation target is:

```text
structured exact search
agentic hybrid search = vector recall + lexical recall + merge/dedupe + LLM rerank
```

---

## 1. Query Router (`queryRouter.js`)

Unit tests — mock OpenAI client.

| # | Case | Expected |
|---|------|----------|
| 1.1 | OpenAI returns `{ mode: "structured", entities: { person: "Tarantino" }, date_hint: "this week" }` | Returns parsed object with correct mode/entities/date_hint |
| 1.2 | OpenAI returns `{ mode: "agentic" }` | Returns mode "agentic", all entities null |
| 1.3 | OpenAI returns malformed JSON | Falls back to `{ mode: "agentic", entities: all null }` |
| 1.4 | OpenAI returns unrecognized mode value | Normalizes to "agentic" |
| 1.5 | Single API failure | Returns agentic fallback; breaker stays closed |
| 1.6 | 5 failures within 60s | Breaker opens → returns `{ mode: "degraded" }` |
| 1.7 | Breaker open, <30s elapsed | Returns degraded without calling API |
| 1.8 | Breaker open, ≥30s elapsed (half-open) | Allows one API call through |
| 1.9 | Half-open retry succeeds | Breaker resets to closed |
| 1.10 | Half-open retry fails | Breaker stays open, timer resets |

### Circuit breaker state isolation

Tests must reset module-level breaker state between runs (re-import or expose a `resetBreaker()` for testing).

### Planned intent_type classification

Router/extractor output now includes `intent_type`; add tests for the mapping below:

| # | Query | Expected `mode` | Expected `intent_type` | Expected `result_type` |
|---|-------|-----------------|------------------------|------------------------|
| 1.11 | "dreamy melancholic romance" | `agentic` | `discovery_query` | `film_results` |
| 1.12 | "tonight under 90 minutes" | `agentic` | `constraint_heavy_query` | `screening_results` |
| 1.13 | "when is Happy Together playing" | `structured` | `known_film_query` | `film_showtimes` |
| 1.14 | "what's at the Rio tonight" | `structured` | `known_cinema_query` | `cinema_schedule` |
| 1.15 | "Tarantino this week" | `structured` | `known_person_query` | `person_results` |
| 1.16 | "Wong Kar-wai style" | `agentic` | `style_reference_query` | `film_results` |
| 1.17 | Structured no-result state | `structured` | original known-entity intent | `empty_with_fallback` |

---

## 2. Verification Service (`verificationService.js`)

Unit tests — mock OpenAI client.

| # | Case | Expected |
|---|------|----------|
| 2.1 | Normal response with valid scores | Correctly maps index → film_id; returns `[{ film_id, score, explanation }]` |
| 2.2 | LLM returns out-of-range index (0, 16, -1) | Invalid indices filtered out, valid ones returned |
| 2.3 | LLM returns malformed JSON | Returns `[]` (graceful failure) |
| 2.4 | `complex: false` | Calls gpt-4o-mini; explanation is null |
| 2.5 | `complex: true` | Calls gpt-4o; explanation is populated |
| 2.6 | Empty candidates array | Returns `[]` immediately, no API call |
| 2.7 | Candidates > 15 | Only first 15 are sent to LLM |
| 2.8 | Film with null year/genre/description | Prompt uses fallback values ("?", "N/A", "No description"), no crash |

---

## 3. Search Orchestrator (`searchOrchestrator.js`)

Unit tests — mock all downstream services (queryRouter, embeddingService, semanticSearch, lexicalSearch, structuredSearch, verificationService, dateResolver, cinemaResolver).

### Structured path

| # | Case | Expected |
|---|------|----------|
| 3.1 | routing.mode = "structured", entities.person set | Calls `searchByPerson` with resolved params |
| 3.2 | routing.mode = "structured", entities.film set | Calls `searchByFilm` |
| 3.3 | routing.mode = "structured", entities.cinema set | Calls `searchByCinema` via cinemaResolver |
| 3.4 | Structured returns empty array | Response includes `fallback_available: true`, `fallback_hint` |
| 3.5 | filters.cinemaIds provided | Overrides entities.cinema resolution |
| 3.6 | date_hint = "this weekend" | Resolved to correct gte/lt range |

### Agentic path

| # | Case | Expected |
|---|------|----------|
| 3.7 | Normal flow end-to-end | constraint extraction → vector recall + lexical recall → merge/dedup → filter → verify → score filter → return |
| 3.8 | Constraint extraction returns malformed JSON | Falls back to `{ vibe_keywords: query, complex: false }` |
| 3.9 | runtime_max constraint | Candidates exceeding runtime are filtered out |
| 3.10 | Duplicate film_ids across vector + lexical candidates | Merges into one verification candidate with combined retrieval metadata |
| 3.11 | Verification throws | Returns candidates unscored (best-effort) |
| 3.12 | All candidates score < 5 | Returns empty items + "No good matches" message |
| 3.13 | Mixed scores: some ≥5, some <5 | Only ≥5 returned, sorted by score desc |
| 3.14 | filters.limit = 5 | Returns at most 5 items |
| 3.15 | No date filter and no date_hint | Defaults gte to now |
| 3.16 | Candidate appears in both recall sources | Sets `retrieval_source: "both"` and preserves `similarity` + `lexical_rank` |
| 3.17 | More than 15 merged candidates | Verification batch prioritizes candidates found by both sources, then alternates vector/lexical |
| 3.18 | Lexical search throws | Continues with vector candidates only |
| 3.19 | Vector search throws | Continues with lexical candidates only if embedding/semantic recall fails after query embedding |

### Degraded path

| # | Case | Expected |
|---|------|----------|
| 3.20 | routing.mode = "degraded" | Uses Prisma ILIKE on film title |
| 3.21 | Degraded with cinemaIds filter | Adds cinema_id constraint to query |
| 3.22 | Degraded with no results | Returns empty items + limited search message |

---

## 4. Response Formatter / Presentation Types

Unit tests — mock search results and verify response shaping.

| # | Case | Expected |
|---|------|----------|
| 4.1 | Agentic discovery query (`"dreamy melancholic romance"`) | Returns `result_type: "film_results"` |
| 4.2 | Agentic results contain multiple screenings for the same film | Response dedupes by `film_id` and nests matching rows in `showtimes[]` |
| 4.3 | Known film query (`"when is Happy Together playing"`) | Returns `result_type: "film_showtimes"` with one film and all matching showtimes |
| 4.4 | Known cinema/date query (`"what's at the Rio tonight"`) | Returns `result_type: "cinema_schedule"` or `screening_results`, ordered by start time |
| 4.5 | Known person query (`"Tarantino this week"`) | Returns `result_type: "person_results"` and preserves exact SQL/entity provenance |
| 4.6 | Structured path with no results | Returns `result_type: "empty_with_fallback"` with `fallback_available` and `fallback_hint` |
| 4.7 | Agentic verification rejects all candidates | Returns `result_type: "empty_with_fallback"` or `film_results` with empty items and clear message |
| 4.8 | Film-level item includes showtimes | Each `showtimes[]` entry includes screening id, cinema, start/end time, runtime, and source URL |

---

## 5. Structured Search (`structuredSearch.js`)

Integration tests — require database connection (or mock `prisma.$queryRawUnsafe`).

| # | Case | Expected |
|---|------|----------|
| 5.1 | `searchByPerson({ personName: "Tarantino" })` | JOINs film_person + person, returns matching screenings |
| 5.2 | `searchByPerson` with cinemaIds filter | Adds `cinema_id = ANY(...)` to WHERE |
| 5.3 | `searchByPerson` with gte + lt | Adds date range to WHERE |
| 5.4 | `searchByFilm({ filmTitle: "Nosferatu" })` | Matches against title and normalized_title |
| 5.5 | `searchByFilm` with smart quotes | `"it’s"` normalized to `"it's"` for matching |
| 5.6 | `searchByCinema({ cinemaIds: [1] })` | Returns all screenings for that cinema |
| 5.7 | `searchByCinema` with no gte/lt | No date constraint in WHERE |
| 5.8 | All functions: `is_active = true` | Inactive screenings never returned |
| 5.9 | All functions: result shape | Returns correct fields via `mapRow` |

---

## 6. Lexical Search (`lexicalSearch.js`)

Integration tests — require database connection (or mock `prisma.$queryRawUnsafe`).

| # | Case | Expected |
|---|------|----------|
| 6.1 | `lexicalSearch({ query: "Happy Together" })` | Uses `websearch_to_tsquery` and ranks exact title match highly |
| 6.2 | Query contains title fragment | Returns matching film rows with positive `lexical_rank` |
| 6.3 | Query contains genre/description token (`"noir"`, `"silent"`, `"anime"`) | Returns candidates with lexical overlap |
| 6.4 | Query has cinemaIds filter | Adds `s.cinema_id = ANY(...)` to WHERE |
| 6.5 | Query has gte + lt | Adds date range constraints |
| 6.6 | Empty or stopword-only query | Returns `[]` or safe fallback, no SQL error |
| 6.7 | Result appears multiple times across screenings | Preserves screening rows but allows orchestrator to dedupe by film for verification |
| 6.8 | Result shape | Returns fields compatible with semanticSearch plus `lexical_rank` and `retrieval_source: "lexical"` |

---

## 7. Search Controller (`searchController.js`)

Integration tests — mock orchestrator, test HTTP layer.

| # | Case | Expected |
|---|------|----------|
| 7.1 | `GET /api/smart-search?q=tarantino` | 200 with JSON body containing mode + items |
| 7.2 | Missing `q` parameter | 400 validation error |
| 7.3 | `cinema_ids=1,2,3` | Parsed as `[1, 2, 3]` in filters |
| 7.4 | `cinema_ids=1,abc,3` | Non-finite values filtered out → `[1, 3]` |
| 7.5 | Degraded mode response | Header `X-Search-Degraded: true` present |
| 7.6 | Orchestrator throws | 500 passed to error handler via `next(err)` |

---

## Priority

1. **Query Router** — circuit breaker logic is critical for resilience
2. **Orchestrator** — routing + filtering + score thresholds
3. **Verification Service** — edge cases (malformed LLM output)
4. **Response Formatter** — API shape and grouping behavior
5. **Lexical Search** — SQL correctness and safe query parsing
6. **Structured Search** — SQL correctness
7. **Controller** — HTTP layer (simplest, least risk)

---

## 8. End-to-End Query Regression Tests

Live API tests against real database + OpenAI. Not for CI — run manually after deployment to validate search quality.

### Retrieval ablation design

Run the same query set through four retrieval configurations to verify that each layer improves quality:

| Variant | Retrieval | Rerank | Purpose |
|---------|-----------|--------|---------|
| A | Vector TopK only | None | Baseline semantic recall quality |
| B | Lexical TopK only | None | Baseline keyword/title/name recall quality |
| C | Vector + Lexical | None | Measures whether hybrid recall improves candidate coverage |
| D | Vector + Lexical | LLM verification/scoring | Final expected product behavior |

For variants A-C, record raw candidates and retrieval scores. For variant D, record `match_score`, `match_explanation` when present, and final rank.

### v3 Baseline (2026-04-23, semantic/agentic architecture)

Actual API responses recorded before v4 rewrite. Serves as a reference point — not a target to replicate, but a benchmark to improve upon.

#### Queries that worked well in v3

| Query | v3 Route | Top Results | Assessment |
|-------|----------|-------------|------------|
| "dreamy melancholic romance" | semantic | The Green Ray (0.373), Two Seasons Two Strangers (0.354) | Correct — vibe matched |
| "dark atmospheric japanese thriller" | semantic | All the Long Nights (0.503), Two Seasons Two Strangers (0.472) | Correct — genre+mood matched |
| "classic European cinema with beautiful cinematography" | semantic | Man With a Movie Camera (0.478), The Damned (0.453), D'est (0.439), The Leopard (0.427) | Correct |
| "intense war drama this weekend" | agentic | The Damned (score:9), Palestine 36 (score:7) | Correct — constraint + vibe |
| "a movie my film-buff friend would respect but my partner won't hate" | agentic | The Art of Adventure (score:8), Really Happy Someday (score:7) | Correct — complex reasoning |

#### Queries that exposed problems in v3

| Query | v3 Route | v3 Result | Problem |
|-------|----------|-----------|---------|
| "wong kar-wai style visual aesthetic" | semantic | Happy Together (0.452) | Wrong — returned the director's OWN film instead of stylistically similar films by others |
| "something light and fun for a first date under two hours" | agentic | Empty (all scored <5) | Partially correct — filtered out bad matches, but ideally should find SOMETHING if any light films exist |

### v4 Expected Behavior

For each query, document what v4 SHOULD do differently (or the same).

| Query | v4 Expected Route | v4 Expected Behavior | Pass Criteria |
|-------|-------------------|---------------------|---------------|
| "dreamy melancholic romance" | agentic | Embedding recall finds same candidates; verification confirms them (score ≥5) | Same quality results as v3, with match_score attached |
| "dark atmospheric japanese thriller" | agentic | Same as above | Top results score ≥7 |
| "classic European cinema with beautiful cinematography" | agentic | Same as above | Top results score ≥7 |
| "intense war drama this weekend" | agentic | Constraint extraction gets date_hint; verify confirms genre match | The Damned still top if screening exists in date range |
| "a movie my film-buff friend would respect but my partner won't hate" | agentic (complex) | `complex: true` → GPT-4o verify with explanations | Returns scored results with explanation text |
| "wong kar-wai style visual aesthetic" | agentic | Embedding may still recall Happy Together, but verification reads description and judges whether it matches "style aesthetic" intent | If query means "films WITH this aesthetic" → HT might pass. If means "similar style by OTHER directors" → HT should be deprioritized. Ambiguous — document actual behavior |
| "wong kar-wai films" | structured | Entity extraction: `{ person: "Wong Kar-wai" }` → SQL JOIN film_person | Returns only films directed by Wong Kar-wai |
| "something light and fun for a first date under two hours" | agentic | Constraint extraction: `runtime_max: 120`, vibe: "light fun date movie" | If no matches: empty + message. Should NOT return Happy Together |
| "when is Happy Together playing" | structured | Entity extraction: `{ film: "Happy Together" }` → SQL ILIKE | Returns screening times for that specific film |
| "what's at the Rio this week" | structured | Entity extraction: `{ cinema: "Rio" }`, date_hint: "this week" | Returns all Rio screenings in date range |
| "Tarantino this week" | structured | Entity extraction: `{ person: "Tarantino" }` | SQL lookup, no embedding involved |

### Response Type Regression Cases

| Query | Expected `result_type` | Pass Criteria |
|-------|------------------------|---------------|
| "dreamy melancholic romance" | `film_results` | One item per film; duplicate screenings nested in `showtimes[]` |
| "when is Happy Together playing" | `film_showtimes` | One film result with all matching showtimes |
| "what's at the Rio this week" | `cinema_schedule` | Results grouped or ordered as a venue schedule |
| "Tarantino this week" | `person_results` | Exact person/entity provenance; no vector-only fuzzy substitutions |
| "Tarkovsky" with no upcoming screenings | `empty_with_fallback` | Empty exact result plus explicit style-search fallback |

### Additional v4 Test Queries

New queries to stress-test v4-specific features. No v3 baseline exists for these.

| Query | Expected Route | What it tests |
|-------|---------------|---------------|
| "tonight at the cinematheque" | structured | Cinema + date resolution, no vibe component |
| "short film under 90 minutes tomorrow" | agentic | runtime_max + date constraint extraction |
| "NOT horror, something cheerful" | agentic | `avoid` field in constraint extraction |
| "visually stunning but emotionally heavy" | agentic | Contradictory vibes — tests verification nuance |
| "something like In the Mood for Love" | agentic | Film name used as style reference, NOT structured lookup |
| "Tarkovsky" | structured | Single-word entity → person lookup |
| "Tarkovsky-esque" | agentic | Suffix signals style reference, not entity lookup |

### v4.1 Hybrid Retrieval Queries

Queries designed specifically to show where lexical recall complements vector recall.

| Query | Expected Route | What it tests |
|-------|---------------|---------------|
| "nosferatu restoration" | agentic or structured depending router output | Exact title/token recall plus description/title metadata |
| "silent german expressionism" | agentic | Lexical genre/style tokens + vector vibe match |
| "anime tonight" | agentic | Short exact genre token that may be weak for vector alone |
| "film at viff with Palestine in the title" | agentic or structured | Exact title token plus cinema/date constraints |
| "japanese thriller tonight" | agentic | Hybrid recall with date constraint and mood/genre terms |
| "rio campy horror" | agentic | Cinema constraint + lexical genre + vibe |
| "movie with leopard in title" | agentic or structured | Title-fragment recall |

### How to Record Results

After each deployment, run the full query set and record in this format:

```markdown
### v4 Results (YYYY-MM-DD)

| Query | Actual Route | Top Results (title, score) | Pass? | Notes |
|-------|-------------|---------------------------|-------|-------|
| "dreamy melancholic romance" | agentic | The Green Ray (8), ... | ✓ | |
| ... | | | | |
```

**Evaluation criteria:**
- **Route correctness**: Did the router pick the right path?
- **Vector recall quality**: Did embedding surface relevant semantic candidates? (Check raw candidates before verification)
- **Lexical recall quality**: Did full-text search surface exact-token candidates that vector missed?
- **Hybrid coverage**: Did vector + lexical increase candidate coverage without flooding verification with noise?
- **Verification accuracy**: Did scores correctly separate good from bad?
- **No false confidence**: If nothing matches, does system return empty + message instead of bad recommendations?
- **Regression check**: Are v3's correct results still correct in v4?
- **Improvement check**: Are v3's problem queries handled better?

---

## Notes

- All unit tests (sections 1-7) mock OpenAI by default. No real API calls in CI.
- Circuit breaker tests need module state isolation (reset between cases).
- Structured search tests can use either mocked `prisma.$queryRawUnsafe` (unit) or a test database with seed data (integration).
- Lexical search tests can use mocked SQL for unit coverage, but ranking quality should be checked against a seeded database or live Render Postgres snapshot.
- Existing test framework: Jest + supertest (see `backend/jest.config.js`).
- Section 8 (regression tests) requires live database + OpenAI API key. Run manually, not in CI.
