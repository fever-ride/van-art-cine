# Smart Search — Implementation Plan (v3)

## Context

The app has two search APIs:

| Endpoint | Purpose | Calls LLM |
|----------|---------|-----------|
| `GET /api/screenings?q=...` | Keyword search (existing, unchanged) | Never |
| `GET /api/search?q=...` | Smart search (new) | Every request |

Keyword search stays as the default. Smart search is a separate mode the user explicitly opts into on the frontend.

### Smart Search — Two Tiers

| Tier | When | Strategy | External API calls |
|------|------|----------|-------------------|
| **Semantic** | Query describes mood, theme, style, genre | Embed query → pgvector cosine similarity | 1× GPT-4o-mini (classify) + 1× embedding |
| **Agentic** | Query has hard constraints (time, duration, location) or complex personal preferences | LLM decomposes intent → semantic search → filter → explain | 1× GPT-4o-mini + 1× embedding + 2× GPT-4o |

### Tech Demonstrated

Semantic search / RAG, pgvector + HNSW index, OpenAI embeddings, intent classification, agentic search orchestration, LLM slot extraction, natural language date/cinema resolution

---

## Architecture Overview

```
User opts into "Smart Search" and enters query
  │
  ▼
GET /api/search?q=...
  │
  ▼
Intent Classifier (GPT-4o-mini — fast, cheap)
  │
  ├─ SEMANTIC ──→ embed query → pgvector cosine search
  │               → return { items, tier: "semantic", similarity }
  │
  └─ AGENTIC ──→ GPT-4o decomposes query into constraints
                  → semantic search with vibe_keywords
                  → hard constraint filtering (runtime, date, cinema)
                  → GPT-4o generates per-film explanation
                  → return { items, tier: "agentic", similarity, match_explanation }
```

Key distinction: if the query ONLY describes what kind of film → semantic. If it includes constraints like time, duration, area, or complex personal preferences → agentic.

Fallback: if the classifier fails or times out, default to semantic (safe middle ground).

---

## Phase 1: Database + Embedding Infrastructure ✅ DONE (2026-04-23)

### 1.1 Prisma Migration — pgvector + film_embedding table ✅

Migration: `backend/prisma/migrations/20260423000000_add_film_embeddings/migration.sql`

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

### 1.2 Dependencies ✅

- `openai` added to `backend/package.json`
- `OPENAI_API_KEY` added to `backend/.env`

### 1.3 `backend/src/services/embeddingService.js` ✅

- `buildFilmDocText(filmId)` — title, year, genre, directors, country, language, rated, awards, description, tags
- `generateEmbedding(text)` — OpenAI text-embedding-3-small → 1536-dim vector
- `upsertFilmEmbedding(filmId)` — build doc text → embed → upsert via raw SQL (ON CONFLICT UPDATE)
- `embedQuery(queryText)` — embed a search query

### 1.4 Backfill Script ✅

`backend/scripts/backfill-embeddings.js` (Node.js, reuses embeddingService directly)

- Incremental by default (skips films that already have embeddings), `--all` for full rebuild
- Batches of 20 concurrent requests, 500ms delay between batches
- Run: `node scripts/backfill-embeddings.js`
- Result: 779/779 films embedded, 0 errors

---

## Phase 2: Intent Router + Search Endpoint ✅ DONE (2026-04-23)

### 2.1 `backend/src/services/intentClassifier.js` ✅

GPT-4o-mini classifies query into `semantic` or `agentic`. Returns `{ tier }`.

Fallback on error: `{ tier: 'semantic' }`.

### 2.2 `backend/src/services/searchOrchestrator.js` ✅

Central dispatcher:

```javascript
export async function orchestrateSearch({ query, tier, filters })
```

- **Semantic path**: embed query → pgvector cosine search → return results with similarity
- **Agentic path**: GPT-4o slot extraction → semantic search with vibe_keywords → hard constraint filtering (runtime, date, cinema) → GPT-4o explanation generation

### 2.3 `backend/src/services/dateResolver.js` ✅

Rule-based, no LLM. Uses `date-fns`.

- "today" / "tonight" → `{ date: '2026-04-23' }`
- "tomorrow" → `{ date: '2026-04-24' }`
- "this weekend" → `{ from: '2026-04-25', to: '2026-04-27' }`

### 2.4 `backend/src/services/cinemaResolver.js` ✅

Fuzzy substring match against cinema table. Cached.

- "rio" → `[166]` (Rio Theatre)
- "cinematheque" → `[1]` (The Cinematheque)
- "viff" → `[112, 113, 116]`

### 2.5 `backend/src/services/explanationService.js` ✅

Agentic tier only. GPT-4o receives each film's description, scores match quality 1-10, and generates 1-2 sentence explanation. Results sorted by score descending — low scores still returned (library is art-house heavy) but clearly marked so frontend can treat them differently.

### 2.6 `backend/src/models/search.js` ✅

Raw SQL with pgvector cosine similarity. Dynamic WHERE clause for date range, cinema IDs, min similarity threshold.

### 2.7 Route: `GET /api/search` ✅

- Controller: `backend/src/controllers/searchController.js`
- Validator: `backend/src/validators/searchValidators.js`
- Route: `backend/src/routes/search.js`
- Mounted in `backend/src/app.js` with 30 req/min rate limit

---

## Phase 3: Frontend Integration — TODO

### 3.1 New: `frontend/app/lib/search.ts`

```typescript
interface SearchResult extends Screening {
  similarity?: number;
  match_explanation?: string | null;
}

interface SearchResponse {
  items: SearchResult[];
  tier: 'semantic' | 'agentic';
}

function searchScreenings(params: SearchQuery): Promise<SearchResponse>
```

### 3.2 New: `frontend/lib/hooks/useSearchData.ts`

Same pattern as `useScreeningsData.ts`. Returns `{ items, tier, loading, error, hasMore, reload }`.

### 3.3 Modify: `frontend/lib/hooks/useScreeningsUI.ts`

Add `searchMode: 'keyword' | 'smart'` to UIState. Default: `'keyword'`.

### 3.4 Modify: `frontend/components/screenings/Filters.tsx`

- Pill toggle: **"Title search"** / **"Smart search"**
- Smart mode placeholder: `"Describe what you're looking for..."`
- Debounce: 800ms in smart mode (vs 350ms for keyword)

### 3.5 Modify: `frontend/app/page.tsx`

Dispatch between `useScreeningsData` (keyword mode) and `useSearchData` (smart mode).

### 3.6 Modify: `frontend/components/screenings/ResultsTable.tsx`

- Show tier badge: "Semantic match: 84%" / "AI recommended"
- Show `match_explanation` for agentic results in expanded row

---

## Phase 4: Pipeline Integration ✅ DONE (2026-04-23)

### 4.1 `database/scripts/generate_embeddings.py` ✅

Pure Python script integrated into the data pipeline. Uses `db_helper.conn_open()` + OpenAI SDK.

- Incremental by default (skips films with existing embeddings), `--all` for full rebuild
- Added as step 8 in `database/scripts/run_all.py`, runs after `merge_staging_to_live`
- New films get embeddings automatically on every pipeline run

---

## Response Shape

Both tiers return the same base shape. Tier-specific fields are optional.

```json
{
  "tier": "semantic",
  "items": [
    {
      "id": 2738,
      "title": "Happy Together",
      "year": 1997,
      "start_at_utc": "2026-04-28T03:00:00.000Z",
      "cinema_name": "VIFF Centre - VIFF Cinema",
      "genre": "Drama, Romance",
      "runtime_min": 96,
      "similarity": 0.452,
      "match_score": null,
      "match_explanation": null
    }
  ]
}
```

- `similarity` — present for both tiers (cosine similarity 0–1)
- `match_score` — agentic only (1–10, GPT-4o judges match quality based on film description). Results with score < 5 are filtered out.
- `match_explanation` — agentic only (1–2 sentence reasoning)
- `message` — present when agentic tier finds no good matches (all scores < 5)

---

## Test Results (2026-04-23)

All results below are actual API responses, not edited.

### Semantic Tier

**Query: "dreamy melancholic romance"**
```
Tier: semantic
0.373 | The Green Ray (1986) | Drama, Romance | The Cinematheque
0.354 | Two Seasons, Two Strangers (2025) | Drama | The Cinematheque
```

**Query: "wong kar-wai style visual aesthetic"**
```
Tier: semantic
0.452 | Happy Together (1997) | Drama, Romance
0.367 | Yi Yi (2000) | Drama
```

**Query: "dark atmospheric japanese thriller"**
```
Tier: semantic
0.503 | All the Long Nights (2024) | Drama | Japan
0.472 | Two Seasons, Two Strangers (2025) | Drama | Japan
```

**Query: "visually stunning animation"**
```
Tier: semantic
0.381 | The Forgotten Reels of Nunavut's Animation Workshop
```

**Query: "classic European cinema with beautiful cinematography"**
```
Tier: semantic
0.478 | Man With a Movie Camera | Documentary | Soviet Union
0.453 | The Damned (1969) | Drama, War | Italy, West Germany, Switzerland
0.439 | D'est (1993) | Documentary | Belgium, France, Portugal
0.427 | The Leopard (1963) | Drama, History | Italy, France
```

### Agentic Tier

**Query: "something light and fun for a first date under two hours"**
```json
{
  "tier": "agentic",
  "message": "No good matches found for your query among current screenings.",
  "items": []
}
```
All candidates scored below 5 and were filtered out. GPT-4o read the film descriptions and correctly identified that none of the art-house screenings match a "light fun comedy" request — instead of recommending "Happy Together" just because the title sounds cheerful.

**Query: "a movie my film-buff friend would respect but my partner won't hate"**
```
Tier: agentic
score:8 | The Art of Adventure (2025) | Documentary | VIFF Centre
  → This documentary combines adventure and art, offering a balanced and
    engaging experience that is both thought-provoking and accessible,
    likely to satisfy both a film buff and a general viewer.
score:7 | Really Happy Someday (2024) | Drama | Rio Theatre
  → This drama offers a thought-provoking narrative about self-discovery
    and identity, which could appeal to film buffs, while its engaging
    personal story might be accessible and entertaining for a wider audience.
```

**Query: "intense war drama this weekend"**
```
Tier: agentic
score:9 | The Damned (1969) | Drama, War | The Cinematheque
  → The film is a war drama set during the Third Reich, matching the
    intense and historical aspects of the query. Its runtime is suitable
    for a weekend screening.
score:7 | Palestine 36 | Biography, Drama, History | VIFF Centre
  → While not explicitly a war drama, it deals with historical conflict
    and unrest, offering an intense and emotional narrative set against
    British colonial rule.
```

### Score threshold

Agentic results with `match_score` < 5 are filtered out. GPT-4o scoring distribution on our art-house library:
- **2–3**: Clearly wrong match (e.g. "Happy Together" for "light fun comedy")
- **5–6**: Relevant but with caveats
- **7–9**: Strong match

5 as cutoff correctly separates "at least relevant" from "not what was asked for".

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Separate APIs | `/api/screenings` (keyword) + `/api/search` (smart) | User typos don't trigger LLM calls; smart search is opt-in |
| Two-tier classifier | GPT-4o-mini: semantic vs agentic | Simpler and more accurate than three-way; structured queries stay on the keyword API |
| Classifier fallback | Default to `semantic` | Safe middle ground — always produces reasonable results |
| Semantic search | pgvector + HNSW | Good enough for < 10K films; no separate vector DB needed |
| Agentic search | GPT-4o for decomposition + explanation | Complex reasoning needs a capable model; only invoked for complex queries |
| Date resolution | `date-fns` rule-based | "this weekend" / "tonight" are deterministic; no LLM needed |
| Cinema resolution | Substring fuzzy match | Small cinema list (< 20); exact match + contains is sufficient |
| Explanation | Agentic tier only | Semantic results are self-explanatory; explanation adds latency |
| All LLM calls | OpenAI only | Project already uses OpenAI elsewhere; single SDK, single API key |

---

## Cost & Latency Estimates

| Tier | External calls | Est. latency | Est. cost per query |
|------|---------------|-------------|-------------------|
| Semantic | 1× GPT-4o-mini + 1× embedding | ~1.5s | ~$0.0005 |
| Agentic | 1× GPT-4o-mini + 1× embedding + 2× GPT-4o | ~4s | ~$0.005 |

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/prisma/migrations/20260423000000_add_film_embeddings/migration.sql` | pgvector + film_embedding table |
| `backend/src/services/intentClassifier.js` | GPT-4o-mini: semantic vs agentic |
| `backend/src/services/searchOrchestrator.js` | Dispatch to semantic / agentic path |
| `backend/src/services/embeddingService.js` | OpenAI embedding generation + storage |
| `backend/src/services/explanationService.js` | GPT-4o per-film explanation (agentic only) |
| `backend/src/services/dateResolver.js` | "this weekend" → concrete date range |
| `backend/src/services/cinemaResolver.js` | "rio" → cinema ID fuzzy match |
| `backend/src/models/search.js` | pgvector similarity SQL |
| `backend/src/controllers/searchController.js` | Request handler |
| `backend/src/validators/searchValidators.js` | Input validation |
| `backend/src/routes/search.js` | Route definition |
| `backend/scripts/backfill-embeddings.js` | Node.js embedding backfill script |
| `database/scripts/generate_embeddings.py` | Python pipeline embedding step |

## Files Modified

| File | Change |
|------|--------|
| `backend/src/app.js` | Mount `/api/search` route + 30 req/min rate limit |
| `backend/package.json` | Add `openai` dependency |
| `backend/.env` | Add `OPENAI_API_KEY` |
| `database/scripts/run_all.py` | Add `generate_embeddings` as step 8 |
