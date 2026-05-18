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

- [x] Update design doc (`docs/rag-search-plan.md` → v4)
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

- Design doc: `docs/rag-search-plan.md`
- Branch: `smart-search`

---

## Data Pipeline — Known Issues

### Synthetic source_uid invalidation after film merges

**Status:** Mitigated but not fully resolved

`source_uid` is generated as `sha256(cinema_id|film_id|start_at_utc)`. When `merge_duplicate_films.py` merges film records, `film_id` changes → old `source_uid` becomes stale. The current `merge_staging_to_live.py` mitigates this by matching on business identity `(source, cinema_id, film_id, start_at_utc)` for UPDATE/DEACTIVATE, but `source_uid` in live rows may still reference a deleted film's old ID.

**Impact:** Low. No data loss in current flow, but `source_uid` is unreliable as a stable identifier across pipeline runs.

**Potential fix:** Regenerate `source_uid` after film merges, or switch to a `film_id`-independent UID (e.g. `sha256(cinema_id|normalized_title|start_at_utc)`).

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
