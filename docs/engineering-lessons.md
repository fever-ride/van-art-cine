# Engineering Lessons & Interview Stories

This document collects debugging stories, design tradeoffs, and production-minded decisions from the project. Use it as raw material for behavioral interview answers.

## Smart Search: Embedding Similarity Was Not Enough

### Situation

The first smart search design had a standalone semantic path: embed the user query, run pgvector cosine search, and return the closest films directly.

### Challenge

Cosine similarity was not the same as recommendation quality. A query like "light happy romance" could surface *Happy Together*, a melancholic breakup drama, because the title and genre vocabulary looked close enough in embedding space.

### Action

Reworked the architecture so embedding search became recall only. Added LLM verification/scoring after retrieval, removed the semantic-only return path, and kept structured SQL search for exact entity queries such as director, film, or cinema.

### Result

The system became more trustworthy: semantic retrieval can still find plausible candidates, but the final response is filtered by whether the film actually satisfies the user's intent.

### Interview Angle

Good story for product quality, not over-trusting ML scores, and redesigning an architecture after finding a realistic failure mode.

## Smart Search: Hybrid Retrieval Without Elasticsearch

### Situation

The smart search system needed better recall for exact tokens, title fragments, genre terms, and proper nouns while still supporting vague mood/style queries.

### Challenge

Vector search is good for semantic intent but weaker for exact words. Adding Elasticsearch/OpenSearch would improve lexical retrieval, but it would also add infrastructure, cost, and index synchronization work for a small catalog.

### Action

Kept the deployment Postgres-native: added PostgreSQL full-text lexical recall alongside pgvector recall, then merged and deduped candidates before LLM verification/reranking.

### Result

The feature now has a practical hybrid retrieval architecture:

```text
vector recall + PostgreSQL full-text lexical recall + merge/dedupe + LLM rerank
```

This improves candidate coverage without adding a new managed search service.

### Interview Angle

Good story for pragmatic system design, controlling operational complexity, and choosing the simplest architecture that fits current scale.

## PostgreSQL Full-Text Index: Generated Column Constraint

### Situation

To support BM25-style lexical recall, the first implementation attempted to add a generated `tsvector` column on `film`.

### Challenge

The migration failed locally because PostgreSQL requires generated column expressions to be immutable. The `to_tsvector(...)` expression did not satisfy that constraint in this generated-column context.

### Action

Changed the design to an immutable SQL function, `film_search_vector(title, normalized_title, genre, description)`, and built a GIN index on that function. Updated backend lexical search to call the same function instead of duplicating the full expression in application SQL.

### Result

The local migration applied successfully, lexical search smoke tests passed, and the query/index expression drift risk was reduced.

### Interview Angle

Good story for debugging a database migration, learning from a constraint, and improving maintainability instead of patching around the error.

## Query Router Resilience: Circuit Breaker for OpenAI Failures

### Situation

Smart search depends on GPT-based query routing to decide whether a query should use structured lookup or agentic search.

### Challenge

If OpenAI is degraded, every search request could repeatedly call a failing dependency, increasing latency and potentially cascading cost or user-facing failures.

### Action

Designed a lightweight in-memory circuit breaker: after repeated router failures within a time window, the system skips LLM routing and degrades to keyword title matching with an `X-Search-Degraded` response header.

### Result

The search endpoint has graceful degradation instead of an all-or-nothing dependency on the LLM provider.

### Interview Angle

Good story for reliability, graceful degradation, and designing for third-party API failure.

## Structured Search: Respecting Exact User Intent

### Situation

Some smart search queries ask for a specific entity, such as a director, film, or cinema. Other queries ask for a style or vibe.

### Challenge

Falling back from an exact query to similar recommendations can confuse users. If someone asks for "Tarantino this week", they likely want films by Tarantino, not films that merely feel Tarantino-like.

### Action

Separated structured search from agentic search. Exact entity queries use SQL lookup. If a structured search has no results, the response returns an explicit empty state plus a fallback hint rather than silently mixing in fuzzy results.

### Result

The search behavior better matches user intent and avoids false confidence when there are no matching screenings.

### Interview Angle

Good story for product judgment, API design, and avoiding misleading fallback behavior.

## Smart Search: Separating Retrieval Mode from Response Shape

### Situation

The smart search API originally returned a flat list of screening rows regardless of what the user asked.

### Challenge

Natural-language queries can ask for different kinds of answers: film recommendations, a specific film's showtimes, a cinema schedule, person-related screenings, or a pure availability filter. Forcing all of these into one flat response caused duplicate film results and made the frontend harder to design.

### Action

Introduced a three-layer taxonomy:

```text
mode        = how to retrieve
intent_type = what the user is asking for
result_type = how to present the answer
```

Then added backend result formatters such as `film_results`, `film_showtimes`, `cinema_schedule`, `person_results`, `screening_results`, and `empty_with_fallback`.

### Result

Recommendation-style searches now return one item per film with nested `showtimes[]`, while schedule-oriented searches can return screening-level rows. This removed duplicate film entries from agentic results and gave the frontend a clearer rendering contract.

### Interview Angle

Good story for API design, product modeling, and realizing that "search result" is not one universal object.

## Smart Search: Router vs Extraction Conflict

### Situation

The query router performs a fast, coarse classification, while the agentic extraction step reads the query more deeply to extract constraints and presentation hints.

### Challenge

A query like "light comedy tonight under 2 hours" contains hard constraints (`tonight`, `under 2 hours`) but also subjective recommendation intent (`light comedy`). The router initially classified it as constraint-heavy, which would push the response toward `screening_results`, even though the user likely wanted film recommendations constrained by time/runtime.

### Action

Made the router responsible for coarse retrieval mode, but let the extraction step refine `intent_type` and `presentation_hint`. Tightened the prompts so pure availability filters use `constraint_heavy_query` + `screening_results`, while queries with mood, genre, style, or recommendation quality use `discovery_query` + `film_results` even when they include hard constraints.

### Result

The system can treat "tonight under 90 minutes" as a screening filter while treating "light comedy tonight under 2 hours" as a constrained recommendation. This keeps the response aligned with the user's actual task.

### Interview Angle

Good story for handling ambiguity, layering LLM decisions, and designing guardrails when multiple classifiers can disagree.

## Data Pipeline: `source_uid` Became Unstable After Film Merges

### Situation

The ingestion pipeline generates `source_uid` from `cinema_id`, `film_id`, and `start_at_utc` to identify screenings.

### Challenge

When duplicate film records are merged, `film_id` can change. That makes old `source_uid` values stale even though the real-world screening did not change.

### Action

Mitigated the issue by matching live rows on business identity during update/deactivate logic instead of relying only on the old `source_uid`.

### Result

The current flow avoids data loss, but the backlog documents that `source_uid` is not a stable identifier across film merges and should eventually be regenerated or replaced with a film-id-independent UID.

### Interview Angle

Good story for data modeling, idempotent ETL, and discovering that a supposedly stable identifier was coupled to mutable internal IDs.

## Guest Watchlist: Supporting Login Migration

### Situation

The app supports adding screenings to a watchlist before login, then preserving that intent after the user creates an account or signs in.

### Challenge

Guest state and authenticated user state need to merge cleanly without duplicate watchlist items or lost selections.

### Action

Added watchlist import/toggle flows and backend support for bulk screening lookup so guest selections can be reconciled into the user's persisted watchlist.

### Result

The frontend can support a smoother user journey: users can save screenings first and authenticate later without losing their list.

### Interview Angle

Good story for user experience, state migration, and designing flows that reduce signup friction.

## SSL Renewal: Fixed but Needs Monitoring

### Situation

The production API had an SSL certificate expiry incident.

### Challenge

Certbot auto-renewal can be enabled but still fail silently if monitoring is missing.

### Action

Enabled the certbot timer and documented follow-up monitoring work in the backlog.

### Result

The immediate renewal issue was fixed, and the remaining gap is clearly tracked: add an SSL expiry check or uptime monitor.

### Interview Angle

Good story for operational maturity: fixing the incident, then identifying monitoring as the long-term prevention mechanism.
