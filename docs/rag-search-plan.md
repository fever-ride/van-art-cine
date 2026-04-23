# RAG Semantic Search — Implementation Plan

## Context

The app currently only supports substring matching on `film.normalized_title`. We're adding a semantic search system so users can find screenings with natural language queries like:

- "dark Japanese thriller"
- "classic French new wave"
- "feel-good comedy this weekend at the Rio"
- "anything directed by Wong Kar-wai"

### Tech Keywords

RAG, Embedding, pgvector, semantic search, hybrid search (semantic + structured filtering), LLM integration, full-stack AI (Next.js + Express + Postgres + Prisma)

---

## Architecture Overview

```
User query
  → Frontend (Next.js)
  → GET /api/search?q=...&date=...&cinema_ids=...
  → Backend (Express)
      1. Generate query embedding (OpenAI text-embedding-3-small, 1536 dims)
      2. pgvector cosine similarity search on film_embedding table
      3. JOIN with screening/cinema + structured filters (date, cinema, is_active)
      4. Top results → Claude API generates per-film match explanation
  → Response: screenings with similarity scores + explanations
  → Frontend renders results with match badges + explanation text
```

Existing `GET /api/screenings` remains **untouched**. A new `GET /api/search` endpoint handles all semantic queries.

### Data Flow Diagram

```
┌──────────────┐
│   film table  │  title, description, genre, directors,
│  (Prisma ORM) │  country, language, tags, year, awards
└──────┬───────┘
       │ buildFilmDocText() — concatenate metadata into one string
       ▼
┌──────────────────┐
│  OpenAI Embedding │  text-embedding-3-small → 1536-dim vector
│      API          │
└──────┬───────────┘
       ▼
┌──────────────────┐
│  film_embedding   │  Postgres table with pgvector column
│  (raw SQL)        │  HNSW index for fast cosine search
└──────────────────┘

        User search query
              │
              ▼
┌──────────────────┐
│  OpenAI Embedding │  same model → query vector
│      API          │
└──────┬───────────┘
       ▼
┌──────────────────────────────────────────┐
│  Hybrid Search (raw SQL)                  │
│  1. cosine similarity: 1 - (emb <=> q)   │
│  2. JOIN screening + film + cinema        │
│  3. WHERE is_active, date range, cinemas  │
│  4. ORDER BY similarity DESC              │
└──────┬───────────────────────────────────┘
       ▼
┌──────────────────┐
│  Claude API       │  generate 1-sentence match explanation
│  (Anthropic SDK)  │  per top film (optional)
└──────┬───────────┘
       ▼
   JSON response → Frontend
```

---

## Phase 1: Database + Embedding Infrastructure

### 1.1 Prisma Migration — pgvector + film_embedding table

Create migration: `backend/prisma/migrations/<timestamp>_add_film_embeddings/migration.sql`

Use a **separate `film_embedding` table** (not a column on `film`) because Prisma cannot natively model the `vector` type. All vector operations use raw SQL anyway, so isolating the vector data avoids polluting the Prisma-managed schema.

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding storage, one row per film
CREATE TABLE film_embedding (
  film_id     INT PRIMARY KEY REFERENCES film(id) ON DELETE CASCADE,
  embedding   vector(1536) NOT NULL,
  doc_text    TEXT NOT NULL,          -- the concatenated source text
  model       VARCHAR(64) NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate cosine similarity
CREATE INDEX idx_film_embedding_cosine
  ON film_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Why these HNSW params?**
- `m = 16`: connections per node (good balance of recall vs. index size for < 10K films)
- `ef_construction = 64`: build-time quality (higher = better recall, slower build)
- These are pgvector defaults and work well for datasets under 100K rows

### 1.2 New Dependencies

**Backend** (`backend/package.json`):

| Package | Purpose |
|---------|---------|
| `openai` | OpenAI Node SDK — embedding generation |
| `@anthropic-ai/sdk` | Anthropic SDK — match explanation via Claude |

**Environment variables** (`backend/.env`):

```env
OPENAI_API_KEY=sk-...        # for embedding generation
ANTHROPIC_API_KEY=sk-ant-... # for match explanations
```

### 1.3 New: `backend/src/services/embeddingService.js`

| Function | Description |
|----------|-------------|
| `buildFilmDocText(filmId)` | Query film + directors from DB, concatenate into a single string: `"Title: In the Mood for Love. Year: 2000. Genre: Drama, Romance. Directors: Wong Kar-wai. Country: Hong Kong. Description: Two neighbors..."` |
| `generateEmbedding(text)` | Call OpenAI `text-embedding-3-small` → return `number[]` of 1536 dimensions |
| `upsertFilmEmbedding(filmId)` | Build doc text → embed → `INSERT ... ON CONFLICT DO UPDATE` into `film_embedding` via `prisma.$executeRawUnsafe` |
| `embedQuery(queryText)` | Generate embedding for a user search query string |

**Document text template**:

```
Title: {title}. Year: {year}. Genre: {genre}. Directors: {directors}.
Country: {country}. Language: {language}. Awards: {awards}.
Description: {description}. Tags: {tags}.
```

Only non-null fields are included. This gives the embedding model rich semantic signal.

### 1.4 Backfill Script: `database/scripts/generate_embeddings.py`

Follows the existing Python pipeline pattern (uses `db_helper.conn_open`).

```
Usage:
  python scripts/generate_embeddings.py         # incremental (new films only)
  python scripts/generate_embeddings.py --all   # regenerate ALL embeddings
```

- Finds films without embeddings: `SELECT f.id FROM film f LEFT JOIN film_embedding fe ON f.id = fe.film_id WHERE fe.film_id IS NULL`
- Fetches directors per batch: `SELECT fp.film_id, p.name FROM film_person fp JOIN person p ... WHERE fp.role = 'director'`
- Calls OpenAI batch embedding (up to 100 texts per API call)
- Upserts into `film_embedding` with `ON CONFLICT`

---

## Phase 2: Search Endpoint (Backend)

### 2.1 New: `backend/src/models/search.js`

Core function: `semanticSearch(opts)` — raw SQL query

```sql
SELECT
  s.id, s.start_at_utc, s.end_at_utc, s.runtime_min, s.tz, s.source_url,
  f.id AS film_id, f.title, f.year, f.description, f.rated, f.genre,
  f.language, f.country, f.awards, f.imdb_rating, f.rt_rating_pct,
  f.imdb_votes, f.imdb_id, f.tmdb_id, f.imdb_url,
  c.id AS cinema_id, c.name AS cinema_name,
  1 - (fe.embedding <=> $1::vector) AS similarity
FROM screening s
JOIN film f ON s.film_id = f.id
JOIN film_embedding fe ON f.id = fe.film_id
JOIN cinema c ON s.cinema_id = c.id
WHERE s.is_active = true
  AND s.start_at_utc >= $2                          -- future screenings
  -- dynamic: AND s.start_at_utc < $3               -- date/to filter
  -- dynamic: AND s.cinema_id = ANY($4::int[])      -- cinema filter
  AND 1 - (fe.embedding <=> $1::vector) >= $5       -- similarity threshold
ORDER BY similarity DESC, s.start_at_utc ASC
LIMIT $6 OFFSET $7
```

Directors are fetched in a second query for the result film IDs and merged in JS (same pattern as existing `fetchScreenings`).

### 2.2 New: `backend/src/services/explanationService.js`

- `generateMatchExplanation(query, films)` — single Claude API call
- Input: user query + top unique films (title, year, genre, directors, description snippet, similarity score)
- Output: JSON array of `{ film_id, explanation }` — 1-sentence per film
- Optional: controlled by `explain` query parameter (default `true`)
- Only called for top results (max ~10 unique films) to keep latency low

**Prompt to Claude**:

```
You are a film recommendation assistant. A user searched for: "{query}"

The following films matched. For each, write ONE brief sentence explaining
why it matches the search. Be specific.

Films:
1. {title} ({year}) — {genre}. Director: {directors}. {description snippet}.

Respond as JSON: [{"film_id": 1, "explanation": "..."}]
```

### 2.3 New: `backend/src/validators/searchValidators.js`

```javascript
query('q').notEmpty().trim()           // required
query('date').optional().isISO8601()
query('from').optional().isISO8601()
query('to').optional().isISO8601()
query('cinema_ids').optional()
query('sort').optional().isIn(['relevance', 'time'])
query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
query('offset').optional().isInt({ min: 0 }).toInt()
query('explain').optional().isIn(['true', 'false'])
```

### 2.4 New: `backend/src/controllers/searchController.js`

```
searchHandler:
  1. Extract validated params
  2. embedQuery(q) → query vector
  3. semanticSearch({ queryEmbedding, date, cinemaIds, ... }) → screening rows
  4. if explain !== 'false' && results.length > 0:
       deduplicate films → generateMatchExplanation(q, films) → attach to items
  5. res.json({ items })
```

### 2.5 New: `backend/src/routes/search.js`

```javascript
router.get('/', searchValidator, handleValidationErrors, searchHandler);
```

### 2.6 Modify: `backend/src/server.js`

```javascript
import search from './routes/search.js';
app.use('/api/search', search);
```

Rate limit: 30 req/min per IP (since each request calls OpenAI for embedding).

---

## Phase 3: Frontend Integration

### 3.1 New: `frontend/app/lib/search.ts`

```typescript
interface SearchResult extends Screening {
  similarity: number;
  match_explanation?: string | null;
}

interface SearchQuery {
  q: string;
  date?: string;
  from?: string;
  to?: string;
  cinema_ids?: number[];
  sort?: 'relevance' | 'time';
  limit?: number;
  offset?: number;
  explain?: boolean;
}

function searchScreenings(params: SearchQuery): Promise<{ items: SearchResult[] }>
```

### 3.2 New: `frontend/lib/hooks/useSearchData.ts`

Mirrors `useScreeningsData.ts` but calls `searchScreenings()`. Activated only when searchMode is `'semantic'`.

### 3.3 Modify: `frontend/lib/hooks/useScreeningsUI.ts`

Add to UIState:

```typescript
searchMode: 'keyword' | 'semantic'  // default: 'keyword'
```

### 3.4 Modify: `frontend/components/screenings/Filters.tsx`

- Add pill-style toggle: **"Title search"** / **"Smart search"** (matches existing single-date / date-range toggle pattern)
- Smart search mode: placeholder changes to `"Describe what you're looking for..."`
- Debounce: 600ms for semantic (vs 350ms for keyword)

### 3.5 Modify: `frontend/app/page.tsx`

Conditionally use `useSearchData` when `searchMode === 'semantic'` and `q` is non-empty; otherwise use `useScreeningsData`.

### 3.6 Modify: `frontend/components/screenings/ResultsTable.tsx`

- Show `"Match: 82%"` badge next to title when `similarity` is present
- Show `match_explanation` in expanded detail row (italic, subtle background)

---

## Phase 4: Pipeline Integration

### 4.1 Modify: `database/scripts/run_all.py`

Add `generate_embeddings` step after `merge_staging_to_live` so new films automatically get embeddings after ingestion.

---

## Response Shape

```json
{
  "items": [
    {
      "id": 42,
      "title": "In the Mood for Love",
      "year": 2000,
      "start_at_utc": "2026-04-25T19:00:00.000Z",
      "cinema_name": "The Cinematheque",
      "genre": "Drama, Romance",
      "directors": "Wong Kar-wai",
      "description": "Two neighbors form a bond when they suspect...",
      "imdb_rating": 8.1,
      "similarity": 0.84,
      "match_explanation": "This moody Hong Kong romance matches your search for atmospheric Asian cinema with its dreamlike visuals and melancholic tone.",
      "...": "...other screening fields..."
    }
  ]
}
```

---

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Embedding table | Separate `film_embedding` table | Prisma can't model `vector` type; keeps ORM clean |
| Embedding granularity | Per film (not per screening) | Semantic meaning lives in film metadata; screenings are just time+venue |
| Embedding model | `text-embedding-3-small` (1536 dims) | Good quality/cost ratio; OpenAI's recommended default |
| Vector index | HNSW (not IVFFlat) | Better recall for small datasets (< 100K); no need for training step |
| Match explanation | Claude API (not template) | Much higher quality, contextual explanations |
| Explanation toggle | `explain=true/false` param | Lets frontend skip the Claude call when latency matters |
| Similarity threshold | Default 0.3 | Tunable; prevents noisy low-relevance results |
| New endpoint | `GET /api/search` (not extending `/api/screenings`) | Clean separation; existing functionality untouched |

---

## Verification Plan

1. **Migration**: Run migration → confirm `film_embedding` table and HNSW index exist via `\d film_embedding`
2. **Backfill**: Run `generate_embeddings.py` → confirm all films have embeddings via `SELECT count(*) FROM film_embedding`
3. **Search API**: `curl "localhost:3000/api/search?q=dark+japanese+thriller"` → verify results with similarity scores
4. **Hybrid filters**: `curl "localhost:3000/api/search?q=comedy&cinema_ids=1&date=2026-04-25"` → verify structured filters combine with semantic search
5. **Frontend**: Toggle to "Smart search" → type natural language query → verify results with match badges and explanation text
6. **Pipeline**: Run full ingest → verify new films get embeddings automatically

---

## Files to Create

| File | Type |
|------|------|
| `backend/prisma/migrations/..._add_film_embeddings/migration.sql` | Migration |
| `backend/src/services/embeddingService.js` | Service |
| `backend/src/services/explanationService.js` | Service |
| `backend/src/models/search.js` | Model |
| `backend/src/controllers/searchController.js` | Controller |
| `backend/src/validators/searchValidators.js` | Validator |
| `backend/src/routes/search.js` | Route |
| `frontend/app/lib/search.ts` | API wrapper |
| `frontend/lib/hooks/useSearchData.ts` | Hook |
| `database/scripts/generate_embeddings.py` | Script |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/server.js` | Mount `/api/search` route + rate limit |
| `backend/package.json` | Add `openai`, `@anthropic-ai/sdk` |
| `backend/.env` | Add `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| `frontend/lib/hooks/useScreeningsUI.ts` | Add `searchMode` to UIState |
| `frontend/components/screenings/Filters.tsx` | Add semantic/keyword toggle |
| `frontend/app/page.tsx` | Dispatch between data hooks |
| `frontend/components/screenings/ResultsTable.tsx` | Show similarity + explanation |
| `database/scripts/run_all.py` | Add embedding step |
