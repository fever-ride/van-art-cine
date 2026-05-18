# Smart Search — Implementation Plan (v4)

## Context

The app has two search modes, unified under a single smart search endpoint:

| Mode | When | Strategy | External API calls |
|------|------|----------|-------------------|
| **Structured** | Query references a specific entity (director, film title, cinema) | Entity extraction → SQL lookup + filters | 1× GPT-4o-mini (router) |
| **Agentic** | Query describes mood/vibe/style OR has complex constraints OR requires reasoning | Embedding recall → LLM verification + scoring | 2× GPT-4o-mini (router + constraint extraction) + 1× embedding + 1× GPT-4o-mini or GPT-4o (verify/score) |

The existing keyword search (`GET /api/screenings?q=...`) remains available as a simple title ILIKE fallback, but is not part of the smart search system.

### Why not three tiers (structured / semantic / agentic)?

v3 of this plan had a standalone "semantic" tier: embed query → return cosine results directly without LLM verification. This was removed because:

1. **Embedding similarity ≠ match quality.** Cosine similarity measures text proximity in vector space, not whether a film actually satisfies the user's intent. "light happy romance" returns "Happy Together" (a melancholic breakup drama) at similarity 0.37 — a plausible-looking score for a completely wrong result.

2. **No reliable way to predict when embedding-only is safe.** The classifier cannot determine in advance whether a vibe query will be misled by title words, genre labels, or description language that shares vocabulary with the query without matching tone.

3. **The cost of verification is low; the cost of a bad recommendation is high.** Adding a lightweight GPT-4o-mini verification pass to the top-N results costs ~$0.001 and ~500ms. Serving a confidently wrong recommendation erodes user trust.

Embedding search is now the **recall step** inside the agentic path, not an independent output path. It retrieves candidates; LLM verification decides which candidates actually match.

### Tech Stack

pgvector + HNSW index, OpenAI embeddings (text-embedding-3-small, 1536-dim), GPT-4o-mini (routing + verification), GPT-4o (complex reasoning when needed), rule-based date/cinema resolution

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
  ├─ STRUCTURED
  │   Query contains a recognizable entity (person name, film title, cinema)
  │   │
  │   ▼
  │   Entity extraction → SQL lookup (person/film/cinema tables)
  │   → Apply optional filters (date, cinema, runtime)
  │   → Return results directly (no embedding needed)
  │
  └─ AGENTIC
      Query describes what kind of film / experience the user wants
      │
      ▼
      1. Extract search parameters:
         - vibe_keywords (for embedding recall)
         - hard constraints (date, cinema, runtime)
      2. Embed vibe_keywords → pgvector cosine recall (top 30-40 candidates)
      3. Apply hard constraint filters (date range, cinema, runtime)
      4. LLM verification + scoring:
         - GPT-4o-mini for simple vibe queries (score 1-10)
         - GPT-4o for complex reasoning queries (score 1-10 + explanation)
      5. Filter out score < 5
      6. Return ranked results with match_score and optional explanation
```

### Key insight: embedding is retrieval, LLM is precision

Embedding search is good at narrowing 800 films to 30 plausible candidates. It is bad at judging whether a candidate truly matches the user's intent. LLM verification closes this gap — even for "simple" vibe queries like "light happy romance", it reads the film's description and rejects false positives that embedding similarity alone would surface.

---

## Query Router Design

The router replaces the old "intent classifier" (which only decided semantic vs agentic). It now makes a two-way decision with entity extraction:

```
Input: user query string
Output: { mode: "structured" | "agentic", entities?: {...}, date_hint?: string }
```

### Routing logic

| Signal in query | Route to | Example |
|----------------|----------|---------|
| Named person (director, actor) | structured | "Tarantino movies this week" |
| Specific film title | structured | "when is Happy Together playing" |
| Named cinema without vibe | structured | "what's on at the Rio" |
| Mood/style/genre description | agentic | "dark atmospheric noir" |
| Personal preference / reasoning needed | agentic | "something my partner won't hate" |
| Hard constraints + vibe | agentic | "light comedy tonight under 2 hours" |

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

- "structured": The query asks about a SPECIFIC entity — a named director, actor, 
  film title, or cinema — and wants to find screenings of/by/at that entity.
  Examples: "Tarantino films", "when is Nosferatu playing", "what's at the Rio this week"

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
  "entities": { "person": null | "name", "film": null | "title", "cinema": null | "name" },
  "date_hint": null | "today" | "tonight" | "tomorrow" | "this weekend"
}

Only populate "entities" for structured mode. For agentic mode, set all entity fields to null.
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

## Agentic Path

### Flow

1. Router classifies as agentic
2. Constraint extraction (separate GPT-4o-mini call, distinct from router):
   - `vibe_keywords`: rich descriptive string for embedding recall
   - `date_hint`: "today" / "this weekend" / null → resolved via `dateResolver.js`
   - `cinema_hint`: "rio" / "cinematheque" / null → resolved via `cinemaResolver.js`
   - `runtime_max`: number or null
   - `avoid`: things to exclude (optional)
   - `complex`: boolean — determines whether verification uses GPT-4o or GPT-4o-mini
3. Embedding recall:
   - Embed `vibe_keywords` → pgvector cosine search
   - Retrieve top 30-40 candidates above minimum similarity threshold (0.25)
4. Hard constraint filtering:
   - Date range (from dateResolver)
   - Cinema IDs (from cinemaResolver)
   - Runtime max
5. LLM verification + scoring:
   - For each remaining candidate, LLM reads: user query + film title + genre + description
   - Scores 1-10: does this film actually match what the user is looking for?
   - Optionally generates 1-2 sentence explanation (for complex queries)
6. Filter: remove candidates with score < 5
7. Sort by score descending, return top results

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

## Database + Embedding Infrastructure (unchanged from v3)

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

## Response Shape

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
| `similarity` | null | present (from embedding recall) |
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
| Agentic (simple vibe) | 2× GPT-4o-mini (router + extraction) + 1× embedding + 1× GPT-4o-mini (batched verify) | ~2.5s | ~$0.002 |
| Agentic (complex) | 2× GPT-4o-mini (router + extraction) + 1× embedding + 1× GPT-4o (batched verify+explain) | ~4s | ~$0.006 |

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Remove standalone semantic tier | Embedding is recall-only, always followed by LLM verification | Similarity score alone cannot reliably judge match quality |
| Add structured mode | SQL entity lookup for named persons/films/cinemas | Exact entities should use exact matching; embedding introduces noise for known-item queries |
| Verification for all agentic queries | Even "simple" vibe queries get GPT-4o-mini scoring | Cannot predict in advance which queries will be misled by embedding proximity |
| Batched verification | All candidates scored in one LLM call, max 15 | Reduces latency; LLM scoring degrades beyond ~15 items |
| Router fallback → agentic | If router fails once, default to agentic path | Agentic always verifies; safer than returning unverified results |
| Circuit breaker on repeated failure | ≥5 router failures in 60s → degrade to keyword ILIKE | Prevents cascading LLM costs when OpenAI is down |
| Structured empty → offer fallback | Return empty + `fallback_hint`, don't auto-switch to agentic | Respect user intent; let them opt in to fuzzy results explicitly |
| Score threshold at 5 | Candidates below 5 are filtered out | Calibrated on art-house library: 2-3 = wrong, 5-6 = relevant with caveats, 7-9 = strong match |
| Separate keyword API unchanged | `GET /api/screenings?q=...` stays as-is | Simple ILIKE; no LLM cost; quick path for users who know the exact title |

---

## Migration from v3 (completed)

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

---

## Known Limitations & Future Work

1. **Verification adds latency to all agentic queries.** For queries where embedding results happen to be correct (e.g. "dark japanese thriller"), verification confirms them but adds ~500ms. Acceptable at our scale; at higher QPS, pre-computed mood/tone tags could allow skipping verification for high-confidence matches.

2. **Router accuracy depends on entity recognition.** "Wong Kar-wai style" must route to agentic, not structured. The prompt handles this but edge cases may arise.

3. **Structured path needs robust fuzzy matching.** Users may misspell names. Current plan: ILIKE with wildcards. Future: `pg_trgm` trigram similarity for better typo tolerance.

4. **Score threshold may need re-tuning.** The cutoff of 5 was calibrated on the current art-house library. If the catalog grows to include mainstream titles, the distribution may shift.

5. **No user preference learning.** The system cannot learn that a specific user's "fun" means dark comedy. Would require per-user preference modeling.
