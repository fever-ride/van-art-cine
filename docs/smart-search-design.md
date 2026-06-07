# Smart Search — Design (v4.1)

## Context

The app has two search modes, unified under a single smart search endpoint:

| Mode | When | Strategy | External API calls |
|------|------|----------|-------------------|
| **Structured SQL** | Query can be answered with deterministic SQL: known entity lookup or pure hard constraints | Entity/constraint extraction → SQL lookup + filters | 1× GPT-4o-mini (router) |
| **Agentic hybrid** | Query describes mood/vibe/style, subjective preference, or recommendation quality | Vector recall + PostgreSQL full-text lexical recall → merge/dedupe → LLM verification + scoring | 2× GPT-4o-mini (router + constraint extraction) + 1× embedding + 1× GPT-4o-mini or GPT-4o (verify/score) |

The existing keyword search (`GET /api/screenings?q=...`) remains available as a simple title ILIKE fallback. v4.1 adds PostgreSQL full-text lexical recall inside the smart search agentic path; this is BM25-style keyword retrieval, not a separate Elasticsearch/OpenSearch service.

### Why not three tiers (structured / semantic / agentic)?

v3 of this plan had a standalone "semantic" tier: embed query → return cosine results directly without LLM verification. This was removed because:

1. **Embedding similarity ≠ match quality.** Cosine similarity measures text proximity in vector space, not whether a film actually satisfies the user's intent. "light happy romance" returns "Happy Together" (a melancholic breakup drama) at similarity 0.37 — a plausible-looking score for a completely wrong result.

2. **No reliable way to predict when embedding-only is safe.** The classifier cannot determine in advance whether a vibe query will be misled by title words, genre labels, or description language that shares vocabulary with the query without matching tone.

3. **The cost of verification is low; the cost of a bad recommendation is high.** Adding a lightweight GPT-4o-mini verification pass to the top-N results costs ~$0.001 and ~500ms. Serving a confidently wrong recommendation erodes user trust.

Embedding search is now one **recall step** inside the agentic path, not an independent output path. It retrieves semantically similar candidates; PostgreSQL full-text search retrieves exact-token candidates; LLM verification decides which candidates actually match.

### Tech Stack

PostgreSQL full-text search + GIN index, pgvector + HNSW index, OpenAI embeddings (text-embedding-3-small, 1536-dim), GPT-4o-mini (routing + verification), GPT-4o (complex reasoning when needed), rule-based date/cinema resolution

---

## Architecture Overview

```
User enters natural language query
  │
  ▼
GET /api/smart-search?q=...
  │
  ▼
Query Router (GPT-4o-mini)
  │
  ├─ STRUCTURED SQL
  │   Query is deterministic: known entity OR pure hard constraints
  │   │
  │   ▼
  │   Entity/constraint extraction → SQL lookup (person/film/cinema/screening tables)
  │   → Apply hard filters (date, cinema, runtime)
  │   → Return results directly (no embedding needed)
  │
  └─ AGENTIC
      Query describes what kind of film / experience the user wants
      │
      ▼
      1. Extract search parameters:
         - vibe_keywords (for embedding recall)
         - hard constraints (date, cinema, runtime)
      2. Vector recall:
         - Embed vibe_keywords → pgvector cosine recall over film embeddings
         - Join screenings so only currently available films are returned
      3. Lexical recall:
         - PostgreSQL full-text search over film title, normalized title, genre, and description
         - Rank with ts_rank_cd as a lightweight BM25-style signal
      4. Merge + dedupe:
         - Combine vector and lexical candidates by film_id/screening id
         - Keep retrieval provenance (`vector`, `lexical`, `both`) and recall scores
      5. Push hard constraint filters into retrieval SQL (active screenings, date range, cinema, runtime)
      6. LLM verification + scoring:
         - GPT-4o-mini for simple vibe queries (score 1-10)
         - GPT-4o for complex reasoning queries (score 1-10 + explanation)
      7. Filter out score < 5
      8. Return ranked results with match_score and optional explanation
```

### Key insight: recall needs both semantic and lexical signals

Embedding search is good at narrowing the film catalog to plausible candidates for mood/style queries. It is weak on exact tokens, title fragments, genre labels, and unusual vocabulary. PostgreSQL full-text search complements it by retrieving candidates with strong lexical overlap in film-local text fields. Both are still recall mechanisms, not final judgment: LLM verification closes the precision gap by reading the user's intent and the film metadata before scoring.

Current lexical recall intentionally indexes film-local fields only: `title`, `normalized_title`, `genre`, and `description`. Director/person names are handled by the structured SQL path when the user is asking for that person directly. If person names should also work as lexical style/reference terms, add them later as a separate indexed text source or joined lexical retriever.

---

## Retrieval Strategy Model

Smart search uses three retrieval strategies, but they are not exposed as three separate user modes. The router/orchestrator chooses or combines them based on the query:

| Strategy | Used when | Retrieves by | Output role |
|----------|-----------|--------------|-------------|
| Structured SQL lookup | User asks for a known film/person/cinema, or asks only for objective availability filters | Exact/entity SQL joins and screening filters over `film`, `screening`, `cinema`, `person` | Final results for deterministic SQL queries |
| Semantic vector recall | User describes mood, style, theme, or preference | OpenAI embedding of `vibe_keywords` compared against `film_embedding.embedding` via pgvector cosine similarity | Candidate recall for discovery/style queries |
| Lexical full-text recall | User includes important title/genre/description keywords | PostgreSQL full-text search over `film_search_vector(title, normalized_title, genre, description)` | Candidate recall that catches exact-token matches vector search can miss |

The key distinction is that structured SQL can be a final retrieval path whenever the query is fully objective. Semantic and lexical search are recall paths inside the agentic pipeline, used only when subjective meaning, style, or preference must be interpreted. Discovery/style queries run both recall sources, merge candidates, and then use LLM verification to decide final relevance.

### Film-level embeddings, screening-level availability

The embedding table is film-level, not screening-level:

```text
film.id ── 1:1 ── film_embedding.film_id
film.id ── 1:N ── screening.film_id
screening.cinema_id ── N:1 ── cinema.id
```

This is intentional. The semantic content that answers "does this match the user's vibe?" lives on the film: title, genre, description, tags, and metadata. The screening rows answer a different question: "is this film currently available, where, and when?"

Vector recall therefore joins `screening`, `film`, `film_embedding`, and `cinema` in one query:

```sql
FROM screening s
JOIN film f ON s.film_id = f.id
JOIN film_embedding fe ON f.id = fe.film_id
JOIN cinema c ON s.cinema_id = c.id
```

That query ranks by film embedding similarity but filters and returns screening availability. This lets the system answer mixed queries like "light comedy tonight under 2 hours": the vibe is evaluated against film embeddings, while "tonight" and "under 2 hours" are pushed down as SQL filters on screenings.

### Why keep `retrieval_source`

Hybrid retrieval should not collapse vector and lexical candidates into an anonymous list. Each candidate keeps provenance:

| `retrieval_source` | Meaning |
|--------------------|---------|
| `vector` | Found by semantic vector recall only |
| `lexical` | Found by PostgreSQL full-text recall only |
| `both` | Found by both recall sources |

This provenance has concrete uses:

1. **Candidate selection:** candidates found by both sources are prioritized before LLM verification because they have two independent recall signals.
2. **Deduplication:** the merge step can combine vector `similarity` and lexical `lexical_rank` for the same screening/film instead of treating them as separate results.
3. **Debugging:** poor results can be traced to vector recall, lexical recall, merge logic, or LLM verification.
4. **Evaluation:** retrieval ablations can compare vector-only, lexical-only, hybrid, and hybrid + LLM rerank using the same result metadata.

The final LLM score remains the precision layer. Retrieval provenance helps build and inspect the candidate pool; it does not override verification.

---

## Query Router Design

The router replaces the old "intent classifier" (which only decided semantic vs agentic). It now makes a two-way decision with entity extraction:

```
Input: user query string
Output: { mode: "structured" | "agentic", intent_type, entities?: {...}, date_hint?: string, runtime_max?: number }
```

### Routing logic

| Signal in query | Route to | Example |
|----------------|----------|---------|
| Named person (director, actor) | structured | "Tarantino movies this week" |
| Specific film title | structured | "when is Happy Together playing" |
| Named cinema without vibe | structured | "what's on at the Rio" |
| Pure hard constraints only | structured | "tonight under 90 minutes" |
| Mood/style/genre description | agentic | "dark atmospheric noir" |
| Personal preference / reasoning needed | agentic | "something my partner won't hate" |
| Hard constraints + vibe | agentic | "light comedy tonight under 2 hours" |

### Planned intent taxonomy

`mode` is intentionally coarse: it chooses the retrieval family. The next refinement is `intent_type`, which describes what the user is asking for inside that retrieval family. `result_type` then chooses the API presentation shape.

```text
mode        = how to retrieve
intent_type = what the user is asking for
result_type = how to present the answer
```

| `intent_type` | Typical `mode` | Default `result_type` | Examples |
|---------------|----------------|------------------------|----------|
| `discovery_query` | `agentic` | `film_results` | "dreamy melancholic romance", "something fun for a first date" |
| `constraint_heavy_query` | `structured` | `screening_results` | "tonight under 90 minutes", "movies after 7 at Cinematheque" |
| `known_film_query` | `structured` | `film_showtimes` | "when is Happy Together playing?" |
| `known_cinema_query` | `structured` | `cinema_schedule` | "what's at the Rio tonight?" |
| `known_person_query` | `structured` | `person_results` | "Tarantino this week", "Wong Kar-wai films" |
| `style_reference_query` | `agentic` | `film_results` | "Wong Kar-wai style", "Tarkovsky-esque" |

`empty_with_fallback` is not an intent. It is a result state used when exact structured search has no results or agentic verification rejects all candidates.

Current backend implementation has `mode`, `intent_type`, and `result_type`. The router returns coarse `intent_type` and hard constraints for SQL-only queries. The agentic constraint extraction step refines subjective discovery/style queries with `vibe_keywords`, hard filters, and `presentation_hint`.

### Valid combinations

Not every combination is valid. The allowed mapping should stay conservative:

| `mode` | Allowed `intent_type` | Allowed `result_type` |
|--------|------------------------|------------------------|
| `structured` | `known_film_query` | `film_showtimes`, `empty_with_fallback` |
| `structured` | `known_cinema_query` | `cinema_schedule`, `empty_with_fallback` |
| `structured` | `known_person_query` | `person_results`, `empty_with_fallback` |
| `structured` | `constraint_heavy_query` | `screening_results`, `empty_with_fallback` |
| `agentic` | `discovery_query` | `film_results`, `empty_with_fallback` |
| `agentic` | `style_reference_query` | `film_results`, `empty_with_fallback` |
| `degraded` | null | `screening_results`, `empty_with_fallback` |

The key boundary is subjective recommendation language. If a query has only hard constraints, keep it structured SQL. If it has hard constraints plus mood/style/preference, route it to agentic discovery and push the hard constraints into retrieval SQL.

### Why a named entity triggers structured instead of embedding search

"Tarantino" is an exact entity in the `person` table. Embedding search for "Tarantino" would return films that are *stylistically similar* to Tarantino's work — not necessarily directed by him. A SQL JOIN (`film_person WHERE person.name ILIKE '%tarantino%'`) is both faster and more precise.

### Edge case: "Wong Kar-wai style"

The router must distinguish:
- "Wong Kar-wai films" → structured (find films BY this director)
- "Wong Kar-wai style" → agentic (find films LIKE this director's style)

The key signal is whether the user wants the entity itself or something resembling it.

### Router prompt (GPT-4o-mini)

```
You route natural language queries for a movie screening search engine in Vancouver.

Classify into exactly one mode:

- "structured": The query can be answered with deterministic SQL filters and does NOT
  require subjective recommendation judgment. This includes known entity queries and
  pure availability/filter queries.
  Examples: "Tarantino films", "when is Nosferatu playing", "what's at the Rio this week",
  "tonight under 90 minutes", "what's playing tomorrow under 2 hours"

- "agentic": The query describes what kind of experience or film the user wants, 
  using mood, style, genre, theme, personal preferences, or any description 
  that requires judgment to match against films. Also use this when the user 
  references a person/film as a STYLE REFERENCE rather than looking for that 
  specific entity.
  Examples: "dark atmospheric noir", "light fun date movie", 
  "something my film-buff friend would respect", "dreamy melancholic romance",
  "Wong Kar-wai style visual aesthetic"

Key distinction: if the user is looking FOR a known thing → structured.
If the user is looking for something that MATCHES a description → agentic.

Respond as JSON:
{
  "mode": "structured" | "agentic",
  "intent_type": "known_person_query" | "known_film_query" | "known_cinema_query" | "discovery_query" | "constraint_heavy_query" | "style_reference_query",
  "entities": { "person": null | "name", "film": null | "title", "cinema": null | "name" },
  "date_hint": null | "today" | "tonight" | "tomorrow" | "this weekend",
  "runtime_max": null | number in minutes
}

Use "constraint_heavy_query" + "structured" for SQL-only availability/filter queries.
Use "discovery_query" + "agentic" when mood/style/preference language appears, even if
the query also contains hard constraints.
```

Fallback on error: `{ mode: "agentic" }` (safe — agentic always produces verified results).

### Resilience — Circuit Breaker

The router calls GPT-4o-mini on every request. If OpenAI is degraded, we need graceful degradation:

```
Fallback chain:
  Router OK           → structured / agentic (normal)
  Router fails (1×)   → default to agentic (acceptable; one extra embedding + verify call)
  Router fails (≥5× in 60s) → circuit breaker OPEN → degrade to keyword ILIKE search
  After 30s cooldown  → circuit breaker HALF-OPEN → retry the router call
  If succeeds         → circuit breaker CLOSED (resume normal)
```

Implementation: in-memory counter + timestamp in `queryRouter.js`. No external dependency needed at our scale. If the breaker is open, the orchestrator skips all LLM calls and falls through to `GET /api/screenings?q=...` logic (title ILIKE) with a response header `X-Search-Degraded: true` so the frontend can show a notice.

Rate limiting (existing): 30 req/min per IP on `/api/search`. This remains unchanged and acts as the first line of defense against abuse regardless of circuit breaker state.

### Defense gaps to close before public frontend rollout

Current backend resilience is partial:

- Router calls are protected by a circuit breaker.
- Degraded mode can fall back to title search.
- Clearly out-of-scope queries return a fixed unsupported response before expensive retrieval work.
- Smart search query length is capped at 500 characters by request validation.
- Agentic extraction API failure falls back to the original query instead of returning 500.
- Vector and lexical recall failures are best-effort and do not crash the whole agentic path.
- Verification failures return unscored candidates instead of failing the request.

Known gaps:

1. **Out-of-scope guard is conservative.** The first version catches obvious off-topic requests before the router call and accepts model-returned `unsupported` responses. Future work should tune this with real logs.

   Fixed response:

   ```text
   I can help you search Vancouver indie film screenings. Try asking for a film, cinema, showtime, or movie mood.
   ```

2. **No smart-search-specific cost budget yet.** Existing `/api/smart-search` rate limiting is useful, but smart search has OpenAI cost. Consider a stricter route-level limit, user/session budget, or abuse monitoring before public launch.

3. **No explicit LLM timeout policy.** Define request timeout/retry behavior for router, extraction, embedding, and verification calls.

4. **No frontend defensive UX yet.** The frontend should show clear error/degraded/empty states and should not expose internal debug scores to users.

These defenses should be treated as launch blockers for a public-facing Smart Search UI.

---

## Structured Path

### Flow

1. Router extracts entities: `{ person: "Tarantino", cinema: null, date_hint: "this week" }`
2. Entity resolution:
   - Person: fuzzy match against `person.name` / `person.normalized_name` → get `person_id`
   - Film: fuzzy match against `film.title` / `film.normalized_title` → get `film_id`
   - Cinema: `cinemaResolver.js` (existing) → get `cinema_id`
3. SQL query: JOIN `screening` + `film` + `film_person` with resolved IDs + date range filter
4. Return results (no embedding, no LLM scoring needed — precision comes from exact entity match)

### When structured has no results

If the entity lookup returns 0 results (e.g. no upcoming screenings for that director, or entity not found), **do not silently fall back to agentic**. Instead, return an empty result with a fallback hint:

```json
{
  "mode": "structured",
  "items": [],
  "message": "No upcoming screenings found for Tarkovsky.",
  "fallback_available": true,
  "fallback_hint": "Show films with a similar style?"
}
```

The frontend displays the message and a CTA button. If the user opts in, the frontend sends a second request with the query rewritten as a style reference (e.g. "Tarkovsky style"), which routes to agentic.

**Rationale:** The user asked for a specific thing. Silently giving them vaguely related results would be confusing. But a dead end with no option is also bad UX. Offering an explicit opt-in for fuzzy results respects user intent while providing a useful escape hatch. This matches patterns in Netflix/Spotify (exact search → "You might also like..." as a separate section, never mixed into primary results).

---

## Agentic Hybrid Path

### Flow

1. Router classifies as agentic
2. Constraint extraction (separate GPT-4o-mini call, distinct from router):
   - `vibe_keywords`: rich descriptive string for embedding recall
   - `keyword_terms`: short conservative keyword string for lexical recall
   - `date_hint`: "today" / "this weekend" / null → resolved via `dateResolver.js`
   - `cinema_hint`: "rio" / "cinematheque" / null → resolved via `cinemaResolver.js`
   - `runtime_max`: number or null
   - `avoid`: things to exclude (optional)
   - `complex`: boolean — determines whether verification uses GPT-4o or GPT-4o-mini
3. Vector recall:
   - Embed `vibe_keywords` → pgvector cosine search
   - Retrieve top 30-40 candidates above minimum similarity threshold (0.25)
   - Push hard filters into SQL: active screenings, date range, cinema IDs, and runtime max
4. Lexical recall:
   - Run PostgreSQL full-text search over film/search metadata using `keyword_terms`
   - Retrieve top 30-40 candidates ranked by `ts_rank_cd`
   - Use this as a BM25-style exact-token signal for title, genre, and description terms
   - Apply the same hard SQL filters as vector recall
5. Merge + dedupe:
   - Combine vector and lexical candidates
   - Merge duplicate recall rows by screening id so a screening can carry both vector and lexical metadata
   - Select at most one candidate per `film_id` for LLM verification
   - Keep screening rows for final showtime grouping
   - Preserve `similarity`, `lexical_rank`, and retrieval source flags for debugging/evaluation
6. Defensive hard constraint filtering:
   - Date range and cinema IDs are pushed down into retrieval SQL
   - Runtime max is also pushed down into vector and lexical retrieval SQL
   - Keep post-filtering only as a defensive backstop for malformed/null data
7. LLM verification + scoring:
   - For each remaining candidate, LLM reads: user query + film title + genre + description
   - Scores 1-10: does this film actually match what the user is looking for?
   - Optionally generates 1-2 sentence explanation (for complex queries)
8. Filter: remove candidates with score < 5
9. Sort by score descending, return top results

### Why add lexical recall

Vector search handles fuzzy semantic intent well, but it can underperform when the query contains exact words that matter: partial film titles, genre labels, unusual proper nouns, or keywords like "silent", "anime", "noir", and "restoration". Lexical recall provides a second candidate source that is stable for exact tokens in film-local text and cheap to run inside the existing PostgreSQL database.

This is intentionally Postgres-native rather than Elasticsearch/OpenSearch:
- Current catalog size and traffic do not justify another managed search service.
- Film, screening, cinema, person, and tag metadata already live in PostgreSQL.
- Full-text search avoids index synchronization between the primary DB and a separate search cluster.
- Render Postgres can support native full-text search and GIN indexes without new infrastructure.

### Semantic vs lexical query text

The agentic extraction step produces two retrieval strings:

| Field | Used by | Style |
|-------|---------|-------|
| `vibe_keywords` | pgvector semantic recall | Rich, descriptive, can include mood/tone/style expansion |
| `keyword_terms` | PostgreSQL full-text lexical recall | Conservative, close to user wording, focused on title/genre/description keywords |

This separation prevents lexical recall from being diluted by over-expanded semantic language. For example, `light comedy tonight under two hours` may produce:

```json
{
  "vibe_keywords": "light comedy fun uplifting cheerful date night",
  "keyword_terms": "light comedy",
  "date_hint": "tonight",
  "runtime_max": 120
}
```

The semantic retriever benefits from the richer phrase, while the lexical retriever stays anchored to exact film-local terms. If `keyword_terms` is missing, the backend falls back to `vibe_keywords`, then to the original query.

### Candidate merge strategy

The agentic path should retrieve candidates from both sources before LLM verification:

```text
semanticQuery     = constraints.vibe_keywords || originalQuery
lexicalQuery      = constraints.keyword_terms || constraints.vibe_keywords || originalQuery

vectorCandidates  = semanticSearch(embed(semanticQuery), filters, limit=40)
lexicalCandidates = lexicalSearch(lexicalQuery, filters, limit=40)

merged = merge by screening id:
  - keep vector similarity if present
  - keep lexical rank if present
  - mark source: vector | lexical | both
  - sort both-source candidates before single-source candidates

verification_batch = dedupe merged candidates by film_id:
  - avoid asking the LLM to score the same film repeatedly
  - keep screening rows in the final response so film_results can include showtimes[]
```

Initial selection rule for the verification batch:
1. Sort merged candidates by retrieval source (`both` before `vector` before `lexical`), then by best available recall score.
2. Walk the sorted list and keep at most one candidate per `film_id`.
3. Cap at 15 candidates for the existing batched LLM verifier.

The LLM remains the final reranker. Retrieval scores are used only to build a diverse, high-recall candidate set; they should not override the LLM's match score.

### Hard vs soft constraints

Use structured filter pushdown for constraints that are objectively represented in the database:

| Constraint | Handling |
|------------|----------|
| `is_active` | SQL filter in every retrieval path |
| Date/time range | SQL filter via `gte` / `lt` |
| Cinema | SQL filter via resolved `cinema_id` values |
| `runtime_max` | SQL filter via `s.runtime_min <= runtime_max` |

Keep subjective or fuzzy constraints in retrieval text and LLM verification:

| Constraint | Handling |
|------------|----------|
| Mood / vibe / style | `vibe_keywords` + LLM verification |
| `avoid` | Future LLM verification or metadata-aware filtering; do not hard-filter until labels are reliable |
| "good for a first date" / personal preference | LLM verification |
| "not too intense" / "film-buff friend would respect" | LLM verification |

This gives the pipeline a clear rule: hard availability constraints determine the candidate pool; soft taste constraints determine ranking and verification.

### Verification model selection

| Query complexity | Verification model | Why |
|-----------------|-------------------|-----|
| Simple vibe ("dark noir", "romantic drama") | GPT-4o-mini | Straightforward match judgment; mini is sufficient and cheap |
| Complex reasoning ("my partner won't hate", "good for a first date") | GPT-4o | Requires inference about social context, tone judgment |

Complexity is determined by the constraint extraction step (the `complex` field in its response), not the router. The extraction prompt evaluates whether the query requires reasoning about social context or personal preferences.

### Why verification solves the Happy Together problem

Without verification (old v3 semantic path):
- Query: "light happy romance" → embed → cosine search → "Happy Together" at similarity 0.37 → returned to user ❌

With verification (new agentic path):
- Query: "light happy romance" → embed → cosine search → "Happy Together" at similarity 0.37 → GPT-4o-mini reads description: "two men, their relationship deteriorating in Buenos Aires" → score: 2 → filtered out ✓

The LLM does what embedding cannot: it reasons about whether the *content* of the film matches the *intent* of the query, rather than just measuring text proximity.

### Batched verification — design and limits

Instead of N separate LLM calls (one per candidate), batch all candidates into a single prompt:

```
User is searching for: "light happy romance"

Score each film 1-10 on match quality:

1. Happy Together (1997) | Drama, Romance | "Two men from Hong Kong, their relationship deteriorating..."
2. The Green Ray (1986) | Drama, Romance | "A young woman searches for love during summer..."
3. ...

Respond as JSON: { "scores": [{ "index": 1, "score": 2 }, { "index": 2, "score": 6 }, ...] }
```

This reduces N × 300ms to a single ~800ms call regardless of candidate count.

**Batch size cap: 15 candidates per verification call.**

Rationale:
- LLM scoring consistency degrades when evaluating more than ~15-20 items in a single prompt (known issue with positional bias in long lists).
- 15 candidates × ~150 tokens each (title + genre + truncated description) ≈ 2250 tokens input + 300 tokens prompt + 300 tokens output ≈ 3000 tokens total. Well within context limits.
- If hard filtering produces > 15 candidates, take the top-15 by embedding similarity. Candidates ranked 16+ by cosine similarity are unlikely to outscore the top-15 after verification.

**Description truncation: max 150 characters per candidate in the verification prompt.** Full descriptions can be 500+ chars, but verification only needs enough to judge tone and content — not full plot summary. Truncate at sentence boundary when possible.

**If the system ever needs > 15 verified results** (e.g. pagination): split into multiple verification calls. But current UX shows at most 10-15 results per page, so a single batch is sufficient.

---

## Database + Retrieval Infrastructure

### Prisma Migration — pgvector + film_embedding table

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE film_embedding (
  film_id     INT PRIMARY KEY REFERENCES film(id) ON DELETE CASCADE,
  embedding   vector(1536) NOT NULL,
  doc_text    TEXT NOT NULL,
  model       VARCHAR(64) NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_film_embedding_cosine
  ON film_embedding USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### `backend/src/services/embeddingService.js`

- `buildFilmDocText(filmId)` — title, year, genre, directors, country, language, rated, awards, description, tags
- `generateEmbedding(text)` — OpenAI text-embedding-3-small → 1536-dim vector
- `upsertFilmEmbedding(filmId)` — build doc text → embed → upsert via raw SQL (ON CONFLICT UPDATE)
- `embedQuery(queryText)` — embed a search query

### Backfill Script

`backend/scripts/backfill-embeddings.js` — incremental by default, `--all` for full rebuild.

### PostgreSQL Full-Text Lexical Recall (v4.1)

Use PostgreSQL native full-text search as the lexical retriever. This is BM25-style keyword retrieval for this project, not strict BM25 and not a separate Elasticsearch/OpenSearch deployment.

Implemented schema shape:

```sql
CREATE OR REPLACE FUNCTION film_search_vector(
  title text,
  normalized_title text,
  genre text,
  description text
) RETURNS tsvector
IMMUTABLE
LANGUAGE sql
AS $$
  SELECT
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(normalized_title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(genre, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
$$;

CREATE INDEX idx_film_search_vector
  ON film USING GIN (
    film_search_vector(title, normalized_title, genre, description)
  );
```

This uses an immutable SQL function plus a function-based GIN index instead of a generated `tsvector` column. The query path calls the same `film_search_vector(...)` function, which keeps the indexed expression and query expression aligned.

If director/person names should participate in lexical recall, either:
- maintain a separate denormalized search document/table that includes joined person names, or
- add a lexical query that joins `film_person` + `person` and ranks person-name matches separately.

Initial implementation starts with film-local fields (`title`, `normalized_title`, `genre`, `description`) and can add tags/person names after quality testing.

---

## Supporting Services

### `dateResolver.js` (rule-based, no LLM)

- "today" / "tonight" → `{ date: today }`
- "tomorrow" → `{ date: tomorrow }`
- "this weekend" → `{ from: saturday, to: sunday }`

### `cinemaResolver.js` (fuzzy match, cached)

- "rio" → `[166]` (Rio Theatre)
- "cinematheque" → `[1]` (The Cinematheque)
- "viff" → `[112, 113, 116]`

---

## Verification Prompt Design

### For simple vibe queries (GPT-4o-mini, batched)

```
You are verifying whether films match a user's search query for a movie screening app.

User is searching for: "{query}"

Score each film 1-10 on how well it matches what the user is looking for:
- 1-3: Clearly does not match (wrong tone, genre, or mood)
- 4-5: Tangentially related but not what was asked for
- 6-7: Reasonably good match
- 8-10: Excellent match

Films:
{numbered list of candidates with title, year, genre, description}

Respond as JSON: { "scores": [{ "index": 1, "score": <number> }, ...] }
```

### For complex reasoning queries (GPT-4o, batched)

```
You are evaluating whether films match a user's nuanced search query.

User is searching for: "{query}"

Score each film 1-10 considering:
- The explicit criteria stated in the query
- Implicit preferences (e.g. "first date" implies light tone, not too intense)
- Whether this film would actually satisfy the user's underlying need

For each film, also provide a 1-2 sentence explanation.

Films:
{numbered list of candidates with title, year, genre, description, runtime, awards}

Respond as JSON: { "scores": [{ "index": 1, "score": <number>, "explanation": "<string>" }, ...] }
```

---

## Response Presentation Plan

Smart search should not force every natural-language query into the same presentation shape. The backend should separate:

```text
query understanding → retrieval/rerank → response formatter
```

Internally, retrieval can continue to work with screening rows because screenings carry date, cinema, and source URL constraints. For recommendation-style queries, verification/rerank should operate at the film level, and the response should return film-level results with nested showtimes.

### Planned `result_type` values

| `result_type` | When | Response shape |
|---------------|------|----------------|
| `film_results` | Agentic discovery/recommendation queries such as mood, style, genre, vibe, or personal preference | Film-level items with `showtimes[]`, `match_score`, and optional explanation |
| `screening_results` | Constraint-heavy queries where the user primarily wants matching showtimes | Screening-level rows, usually sorted by time |
| `film_showtimes` | Known film query such as "when is Happy Together playing?" | One film result with all matching upcoming showtimes |
| `cinema_schedule` | Known cinema/date query such as "what's at the Rio tonight?" | Schedule grouped by cinema/date/time |
| `person_results` | Known person query such as "Tarantino this week" | Films/screenings associated with that person, with exact SQL provenance |
| `empty_with_fallback` | Structured search has no exact results, or agentic verification rejects all candidates | Empty items plus message/fallback hint |

Current backend implementation adds `result_type` and moves agentic discovery results from repeated screening rows to film-level items:

```json
{
  "mode": "agentic",
  "result_type": "film_results",
  "items": [
    {
      "film_id": 273,
      "title": "The Green Ray",
      "year": 1986,
      "genre": "Drama, Romance",
      "similarity": 0.33,
      "lexical_rank": null,
      "retrieval_source": "vector",
      "match_score": 8,
      "match_explanation": null,
      "showtimes": [
        {
          "id": 2738,
          "start_at_utc": "2026-04-28T03:00:00.000Z",
          "end_at_utc": "2026-04-28T05:00:00.000Z",
          "runtime_min": 98,
          "cinema_id": 1,
          "cinema_name": "The Cinematheque",
          "source_url": "..."
        }
      ]
    }
  ],
  "message": null
}
```

### Formatting rules by mode

- Agentic discovery defaults to `film_results`: dedupe by `film_id`, verify/rerank once per film, and nest matching showtimes under each film.
- Structured film queries should use `film_showtimes`: exact film match first, then all matching showtimes.
- Structured cinema queries should use `cinema_schedule`: the user cares about what's playing at a venue/time, so screening-level ordering is more useful.
- Structured person queries should use `person_results`: preserve exact entity provenance and group by film where possible.
- Empty structured searches should use `empty_with_fallback`: do not silently switch exact-entity intent into fuzzy style recommendations.

---

## Legacy Flat Screening Shape

Earlier smart search responses returned a flat screening list. Keep this shape in mind for compatibility checks, but new agentic responses should prefer `film_results` with nested `showtimes[]`.

```json
{
  "mode": "structured" | "agentic",
  "items": [
    {
      "id": 2738,
      "title": "The Damned",
      "year": 1969,
      "start_at_utc": "2026-04-28T03:00:00.000Z",
      "cinema_name": "The Cinematheque",
      "genre": "Drama, War",
      "runtime_min": 156,
      "source_url": "...",
      "similarity": 0.45,
      "lexical_rank": 0.18,
      "retrieval_source": "both",
      "match_score": 9,
      "match_explanation": "An intense war drama set during the Third Reich..."
    }
  ],
  "message": null
}
```

Field presence by mode:

| Field | Structured | Agentic |
|-------|-----------|---------|
| `similarity` | null | present if found by vector recall |
| `lexical_rank` | null | present if found by lexical recall |
| `retrieval_source` | null | `vector`, `lexical`, or `both` |
| `match_score` | null | present (from LLM verification) |
| `match_explanation` | null | present for complex queries, null for simple |
| `message` | present if no results | present if all candidates scored < 5 |
| `fallback_available` | true if 0 results and entity was valid | null |
| `fallback_hint` | suggestion text for style-based search | null |

---

## Cost & Latency Estimates

| Mode | External calls | Est. latency | Est. cost per query |
|------|---------------|-------------|-------------------|
| Structured | 1× GPT-4o-mini (router) | ~0.8s | ~$0.0002 |
| Agentic hybrid (simple vibe) | 2× GPT-4o-mini (router + extraction) + 1× embedding + 1× PostgreSQL full-text query + 1× GPT-4o-mini (batched verify) | ~2.6s | ~$0.002 |
| Agentic hybrid (complex) | 2× GPT-4o-mini (router + extraction) + 1× embedding + 1× PostgreSQL full-text query + 1× GPT-4o (batched verify+explain) | ~4.1s | ~$0.006 |

PostgreSQL full-text recall adds no external API cost. It adds a small amount of database CPU and GIN index storage on Render Postgres, which is acceptable at the current catalog size and traffic.

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Remove standalone semantic tier | Embedding is recall-only, always followed by LLM verification | Similarity score alone cannot reliably judge match quality |
| Add structured mode | SQL entity lookup for named persons/films/cinemas | Exact entities should use exact matching; embedding introduces noise for known-item queries |
| Add lexical recall to agentic mode | PostgreSQL full-text search runs alongside vector recall | Exact tokens, title fragments, genre terms, and description keywords are more stable with lexical retrieval |
| Avoid Elasticsearch/OpenSearch | Use Postgres-native full-text search | Current data size and QPS do not justify another service or index synchronization pipeline |
| Merge vector + lexical candidates before verification | Dedupe by film/screening and keep retrieval provenance | Improves recall while preserving LLM as final precision layer |
| Add `result_type` | Separate retrieval mode from presentation shape | Natural-language queries can ask for recommendations, showtimes, schedules, or person-specific results |
| Verification for all agentic queries | Even "simple" vibe queries get GPT-4o-mini scoring | Cannot predict in advance which queries will be misled by embedding proximity |
| Batched verification | All candidates scored in one LLM call, max 15 | Reduces latency; LLM scoring degrades beyond ~15 items |
| Router fallback → agentic | If router fails once, default to agentic path | Agentic always verifies; safer than returning unverified results |
| Circuit breaker on repeated failure | ≥5 router failures in 60s → degrade to keyword ILIKE | Prevents cascading LLM costs when OpenAI is down |
| Structured empty → offer fallback | Return empty + `fallback_hint`, don't auto-switch to agentic | Respect user intent; let them opt in to fuzzy results explicitly |
| Score threshold at 5 | Candidates below 5 are filtered out | Calibrated on art-house library: 2-3 = wrong, 5-6 = relevant with caveats, 7-9 = strong match |
| Separate keyword API unchanged | `GET /api/screenings?q=...` stays as-is | Simple ILIKE; no LLM cost; quick path for users who know the exact title |

---

## Migration from v3 (completed) and v4.1 (planned)

### Files changed

| File | What was done |
|------|---------------|
| `backend/src/services/intentClassifier.js` | **Deleted.** Replaced by `queryRouter.js` |
| `backend/src/services/explanationService.js` | **Deleted.** Replaced by `verificationService.js` |
| `backend/src/services/searchOrchestrator.js` | **Rewritten.** Removed semantic-only path; added structured + degraded handlers; agentic path now does constraint extraction → embedding recall → verification |
| `backend/src/controllers/searchController.js` | **Rewritten.** Uses `routeQuery`; passes full routing object to orchestrator; sets `X-Search-Degraded` header |

### New files

| File | Purpose |
|------|---------|
| `backend/src/services/queryRouter.js` | Two-way router (structured/agentic) with circuit breaker |
| `backend/src/services/verificationService.js` | Batched LLM scoring (GPT-4o-mini or GPT-4o); max 15 candidates |
| `backend/src/models/structuredSearch.js` | SQL entity lookup: `searchByPerson`, `searchByFilm`, `searchByCinema` |

### Files unchanged

| File | Reason |
|------|--------|
| `embeddingService.js` | Embedding generation/query unchanged |
| `dateResolver.js` | Date resolution logic unchanged |
| `cinemaResolver.js` | Cinema resolution logic unchanged |
| `backfill-embeddings.js` | Embedding backfill unchanged |
| `generate_embeddings.py` | Pipeline step unchanged |
| `models/search.js` | Semantic search (pgvector cosine) unchanged; structured queries live in new `structuredSearch.js` |
| Migration SQL | pgvector table unchanged |

### Planned v4.1 files

| File | Purpose |
|------|---------|
| New migration SQL | Add PostgreSQL full-text expression GIN index |
| `backend/src/models/lexicalSearch.js` | PostgreSQL full-text lexical recall using `websearch_to_tsquery` / `ts_rank_cd` |
| `backend/src/services/searchOrchestrator.js` | Merge vector + lexical candidates before verification |
| `docs/smart-search-test-plan.md` | Add retrieval ablation eval: vector only, lexical only, hybrid, hybrid + rerank |

---

## Known Limitations & Future Work

1. **Verification adds latency to all agentic queries.** For queries where retrieval results happen to be correct (e.g. "dark japanese thriller"), verification confirms them but adds ~500ms. Acceptable at our scale; at higher QPS, pre-computed mood/tone tags could allow skipping verification for high-confidence matches.

2. **Router accuracy depends on entity recognition.** "Wong Kar-wai style" must route to agentic, not structured. The prompt handles this but edge cases may arise.

3. **Structured path needs robust fuzzy matching.** Users may misspell names. Current plan: ILIKE with wildcards. Future: `pg_trgm` trigram similarity for better typo tolerance.

4. **Score threshold may need re-tuning.** The cutoff of 5 was calibrated on the current art-house library. If the catalog grows to include mainstream titles, the distribution may shift.

5. **No user preference learning.** The system cannot learn that a specific user's "fun" means dark comedy. Would require per-user preference modeling.

6. **Lexical recall is BM25-style, not strict BM25.** PostgreSQL `ts_rank_cd` is sufficient for this catalog size. Strict BM25 would require adding a dedicated search engine or extension, which is unnecessary for the current deployment.
