# Backlog

## Smart Search — Architecture Redesign (v3 → v4)

**Status:** Code complete, tests pending

### Problem

v3's two-tier architecture (semantic / agentic) has a fundamental flaw: the standalone semantic path returns embedding cosine results without LLM verification. Embedding similarity does not reliably indicate match quality — "light happy romance" returns "Happy Together" (a melancholic breakup drama) at similarity 0.37 because the title and genre share vocabulary with the query.

The classifier cannot predict in advance which vibe queries will produce misleading results, so there is no safe way to skip verification.

### Solution (v4)

Replace the three-path system (keyword / semantic / agentic) with two paths:

| Mode | When | Strategy |
|------|------|----------|
| **Structured** | Query references a named entity (director, film, cinema) | Entity extraction → SQL lookup |
| **Agentic** | Everything else (vibe, constraints, reasoning) | Embedding recall → LLM verification + scoring |

Embedding search becomes the recall step inside agentic, not an independent output path. All agentic results are verified by LLM before returning to the user.

### Tasks

- [x] Update design doc (`docs/smart-search-design.md` → v4)
- [x] Rename `intentClassifier.js` → `queryRouter.js`; rewrite prompt for structured/agentic routing + entity extraction
- [x] Add circuit breaker logic in `queryRouter.js` (5 failures / 60s → degrade to keyword)
- [x] Add structured search path in `searchOrchestrator.js` (entity resolution → SQL query)
- [x] Add `models/structuredSearch.js` (entity lookup SQL: person/film/cinema + screening join)
- [x] Implement structured empty-state response with `fallback_available` + `fallback_hint`
- [x] Rewrite `explanationService.js` → `verificationService.js` (batched scoring, max 15 candidates, description truncated to 150 chars)
- [x] Remove semantic-only code path from `searchOrchestrator.js`
- [x] Update `searchController.js` response shape (`mode` instead of `tier`; add fallback fields)
- [ ] Test: "light happy romance" no longer returns Happy Together
- [ ] Test: "Tarantino this week" uses structured path (SQL lookup, no embedding)
- [ ] Test: "Wong Kar-wai style" routes to agentic (not structured)
- [ ] Test: structured path with no results returns fallback hint
- [ ] Test: circuit breaker triggers after repeated router failures

### Reference

- Design doc: `docs/smart-search-design.md`
- Branch: `smart-search`

---

## Smart Search — v4.1 Hybrid Retrieval

**Status:** Backend implemented, frontend/tests pending

### Goal

Upgrade the agentic smart search path from vector-only recall to Postgres-native hybrid retrieval:

```text
vector recall + PostgreSQL full-text lexical recall + merge/dedupe + LLM rerank
```

This should improve exact-token/title/name/genre recall without adding Elasticsearch/OpenSearch or changing the current EC2 backend + Render Postgres deployment.

### Tasks

- [x] Update design doc (`docs/smart-search-design.md`) with v4.1 hybrid retrieval architecture
- [x] Update test/eval plan (`docs/smart-search-test-plan.md`) with vector/lexical/hybrid/rerank ablations
- [x] Add migration for PostgreSQL full-text `film_search_vector(...)` function and GIN index
- [x] Add GIN index for lexical search
- [x] Implement `backend/src/models/lexicalSearch.js` using `websearch_to_tsquery` + `ts_rank_cd`
- [x] Update `searchOrchestrator.js` to call vector + lexical recall in the agentic path
- [x] Push `runtime_max` hard filter into vector and lexical retrieval SQL
- [x] Merge/dedupe candidates and preserve `similarity`, `lexical_rank`, and `retrieval_source`
- [x] Prioritize candidates found by both sources before LLM verification
- [ ] Add unit/integration tests for lexical search and hybrid candidate merge
- [ ] Run live API eval against the ablation query set before deployment
- [ ] Deploy migration to Render Postgres and verify GIN index creation

### Reference

- Design doc: `docs/smart-search-design.md`
- Test plan: `docs/smart-search-test-plan.md`

---

## Smart Search — Evaluation Metrics

**Status:** Planned

### Goal

Build a lightweight but rigorous eval system that separately measures retrieval quality and final answer quality. Do not rely only on subjective review of final responses.

### Metrics

Retrieval layer:

- `Recall@K`
- `MRR`
- `nDCG@K`
- `Top1 hit rate`
- `Bad result rate`

Generation / verification layer:

- Final `nDCG@K`
- Relevant retention rate
- Bad result rejection rate
- `mode` / `intent_type` / `result_type` accuracy
- Explanation accuracy
- No-result honesty

### Tasks

- [ ] Create eval harness folder (`eval/smart-search/`)
- [ ] Create labeled smart search eval set (`query`, expected mode/intent/result type, relevant titles with graded labels, must-not-return titles)
- [ ] Add `metrics.js` for `Top1 hit`, `Recall@K`, `MRR`, `nDCG@K`, bad result rate, and type accuracy
- [ ] Add `run-live-eval.js` for local service/API eval runs
- [ ] Save timestamped machine-readable results under `eval/smart-search/results/*.json`
- [ ] Generate timestamped Markdown reports under `eval/smart-search/results/*.md`
- [ ] Add offline eval mode for saved/mock candidate results
- [ ] Compute initial metrics: `Top1 hit`, `Recall@5`, `bad result rate`
- [ ] Add `MRR` and `nDCG@5`
- [ ] Record retrieval variant results: vector-only, lexical-only, hybrid, hybrid + LLM rerank
- [ ] Add manual review rubric for explanation accuracy and no-result honesty
- [ ] Run live eval before deployment and save results in docs or an eval output file

### Reference

- Test plan: `docs/smart-search-test-plan.md`

---

## Smart Search — Response Presentation Types

**Status:** Backend implemented, frontend/tests pending

### Goal

Separate retrieval mode from response presentation. Natural-language queries can ask for recommendations, showtimes, venue schedules, person-specific screenings, or exact entities, so the API should expose a `result_type` field instead of forcing every response into a flat screening list. A future `intent_type` field should make the user's intent explicit between routing and formatting.

### Taxonomy

```text
mode        = how to retrieve
intent_type = what the user is asking for
result_type = how to present the answer
```

Planned `intent_type` values:

- `discovery_query` — recommendation/discovery query; default `film_results`
- `constraint_heavy_query` — SQL-only schedule/filter-heavy query; default `screening_results`
- `known_film_query` — exact film query; default `film_showtimes`
- `known_cinema_query` — exact cinema/date query; default `cinema_schedule`
- `known_person_query` — exact director/actor query; default `person_results`
- `style_reference_query` — entity used as style reference; default `film_results`

### Planned Result Types

- `film_results` — agentic discovery/recommendation results, one item per film with nested `showtimes[]`
- `screening_results` — constraint-heavy matching screenings, sorted by time
- `film_showtimes` — exact film query with all matching showtimes
- `cinema_schedule` — venue/date query grouped or ordered as a schedule
- `person_results` — exact person query with SQL/entity provenance
- `empty_with_fallback` — no exact result or no verified match, with explicit fallback hint when appropriate

### Tasks

- [x] Add `result_type` to smart search responses
- [x] Build response formatter layer after retrieval/rerank
- [x] Change agentic discovery responses to film-level items with nested `showtimes[]`
- [x] Add `film_showtimes` formatter for exact film queries
- [x] Add `cinema_schedule` formatter for exact cinema/date queries
- [x] Add `person_results` formatter for exact person queries
- [x] Preserve `empty_with_fallback` behavior for structured no-result cases
- [x] Add `intent_type` to router/extractor output
- [x] Map `intent_type` to default `result_type`
- [x] Route pure `constraint_heavy_query` requests through structured SQL lookup to `screening_results`
- [ ] Update frontend smart search UI to render result types differently
- [ ] Add response formatter tests and live regression cases

### Reference

- Design doc: `docs/smart-search-design.md`
- Test plan: `docs/smart-search-test-plan.md`

---

## Data Pipeline — Known Issues

### Synthetic source_uid invalidation after film merges

**Status:** Mitigated but not fully resolved

`source_uid` is generated as `sha256(cinema_id|film_id|start_at_utc)`. When `merge_duplicate_films.py` merges film records, `film_id` changes → old `source_uid` becomes stale. The current `merge_staging_to_live.py` mitigates this by matching on business identity `(source, cinema_id, film_id, start_at_utc)` for UPDATE/DEACTIVATE, but `source_uid` in live rows may still reference a deleted film's old ID.

**Impact:** Low. No data loss in current flow, but `source_uid` is unreliable as a stable identifier across pipeline runs.

**Potential fix:** Regenerate `source_uid` after film merges, or switch to a `film_id`-independent UID (e.g. `sha256(cinema_id|normalized_title|start_at_utc)`).

### Rio detail_url missing can fail staging load

**Status:** Open

The Rio scraper initializes each event with `detail_url = null` during calendar scraping, then fills it only if the detail-page click succeeds. If a Rio event is scraped from the calendar but the click/detail URL step fails, `load_json.py` passes `r.get("detail_url")` into `stg_screening.source_url`, which is `NOT NULL`, causing the whole staging load transaction to roll back.

### Observed failure

Production pipeline run on 2026-05-31 failed during `load_json` with:

```text
null value in column "source_url" of relation "stg_screening" violates not-null constraint
Failing row:
film_id=798
cinema_id=166
source=rio
start_at_utc=2026-06-05 04:00:00
raw_date=Thursday June 4
raw_time=9:00 p.m.
source_url=null
```

Resolved DB context:

- Film: `NOFX: 40 Years Of Fuckin' Up`
- Cinema: `Rio Theatre`
- Showtime: `Thursday June 4, 9:00 p.m.`
- Previous staging row for the same screening had a valid URL: `https://riotheatre.ca/movie/nofx-40-years-of-fuckin-up/`

Likely cause: the new Rio scrape captured the calendar showtime but failed to populate the event-level `detail_url` during the click/detail phase. This can happen if the event click does not navigate, the title match fails, or Rio changes the calendar/card behavior for a specific event.

**Impact:** Medium. The transaction protects against partial staging writes, but `run_all.py` currently continues after `load_json` fails unless `--stop-on-error` is provided, so later steps may operate on older staging data.

In the observed run, `merge_staging_to_live` still ran after `load_json` failed and reported `rows_in=183`, likely because the failed transaction rolled back to the previous staging snapshot. That avoided half-written new staging data, but made the pipeline behavior confusing and could hide ingest failures.

**Potential fixes:**

- [ ] Add a loader fallback for missing `detail_url` before inserting `source_url`:
  - Rio fallback: `https://riotheatre.ca/calendar/`
  - Generic fallback: source cinema website
- [ ] Log missing source URLs with title, source, date, time, generated `source_uid`, and fallback URL used.
- [ ] Make production pipeline runs stop on ingest failure by default, or require `--stop-on-error` in deploy/runbook usage.
- [ ] Consider scraper-side fallback by reading a link/href directly from the Rio calendar card if available.
- [ ] Add a regression test / fixture with a Rio event that has `detail_url = null`.
- [ ] Consider reporting "staging snapshot age" before `merge_staging_to_live` so old staging data is not mistaken for a successful fresh load.

---

## Frontend — Phase 3 (Smart Search UI)

**Status:** Not started

- [ ] `frontend/app/lib/search.ts` — API client for `GET /api/search`
- [ ] `frontend/lib/hooks/useSearchData.ts` — hook for smart search results
- [ ] Add search mode toggle in `Filters.tsx` ("Title search" / "Smart search")
- [ ] Show `match_score` and `match_explanation` in results
- [ ] Debounce: 800ms for smart search (vs 350ms for keyword)
- [ ] Handle "no good matches" message gracefully in UI

---

## Infrastructure

### SSL certificate auto-renewal monitoring

**Status:** Fixed (certbot timer enabled), monitoring not added

The production API (`api.cinephilesvan.com`) had a cert expiry incident. Certbot auto-renewal is now enabled, but there's no alerting if renewal fails silently.

- [ ] Add SSL expiry check (e.g. cron + curl, or uptime monitor on `/readyz`)
