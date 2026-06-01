import { semanticSearch } from '../models/search.js';
import { lexicalSearch } from '../models/lexicalSearch.js';
import { searchByPerson, searchByFilm, searchByCinema } from '../models/structuredSearch.js';
import { embedQuery } from './embeddingService.js';
import { resolveDateHint } from './dateResolver.js';
import { resolveCinemaHint } from './cinemaResolver.js';
import { verifyMatches } from './verificationService.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';
import OpenAI from 'openai';

const TZ = 'America/Vancouver';
const MAX_VERIFY_CANDIDATES = 15;
const MIN_SCORE = 5;

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function mergeCandidatePools(vectorCandidates, lexicalCandidates) {
  const byScreeningId = new Map();

  for (const candidate of vectorCandidates) {
    byScreeningId.set(candidate.id, {
      ...candidate,
      lexical_rank: candidate.lexical_rank ?? null,
      retrieval_source: 'vector',
    });
  }

  for (const candidate of lexicalCandidates) {
    const existing = byScreeningId.get(candidate.id);
    if (existing) {
      byScreeningId.set(candidate.id, {
        ...existing,
        lexical_rank: candidate.lexical_rank,
        retrieval_source: 'both',
      });
    } else {
      byScreeningId.set(candidate.id, {
        ...candidate,
        similarity: candidate.similarity ?? null,
        retrieval_source: 'lexical',
      });
    }
  }

  return [...byScreeningId.values()].sort(compareRecallCandidates);
}

function compareRecallCandidates(a, b) {
  const sourcePriority = { both: 0, vector: 1, lexical: 2 };
  const sourceDiff = sourcePriority[a.retrieval_source] - sourcePriority[b.retrieval_source];
  if (sourceDiff !== 0) return sourceDiff;

  const aScore = Math.max(a.similarity ?? 0, a.lexical_rank ?? 0);
  const bScore = Math.max(b.similarity ?? 0, b.lexical_rank ?? 0);
  if (bScore !== aScore) return bScore - aScore;

  return new Date(a.start_at_utc) - new Date(b.start_at_utc);
}

function selectVerificationCandidates(candidates) {
  const selected = [];
  const seenFilmIds = new Set();

  for (const candidate of candidates) {
    if (seenFilmIds.has(candidate.film_id)) continue;
    seenFilmIds.add(candidate.film_id);
    selected.push(candidate);
    if (selected.length >= MAX_VERIFY_CANDIDATES) break;
  }

  return selected;
}

function toShowtime(item) {
  return {
    id: item.id,
    start_at_utc: item.start_at_utc,
    end_at_utc: item.end_at_utc,
    runtime_min: item.runtime_min,
    tz: item.tz,
    cinema_id: item.cinema_id,
    cinema_name: item.cinema_name,
    source_url: item.source_url,
  };
}

function mapPrismaScreening(s) {
  return {
    id: s.id,
    title: s.film.title,
    start_at_utc: s.start_at_utc,
    end_at_utc: s.end_at_utc,
    runtime_min: s.runtime_min,
    tz: s.tz,
    cinema_id: s.cinema_id,
    cinema_name: s.cinema.name,
    film_id: s.film_id,
    year: s.film.year,
    genre: s.film.genre,
    source_url: s.source_url,
    similarity: null,
    lexical_rank: null,
    retrieval_source: null,
    match_score: null,
    match_explanation: null,
  };
}

function buildFilmResults(items, { limit, includeScores = false } = {}) {
  const byFilmId = new Map();

  for (const item of items) {
    const existing = byFilmId.get(item.film_id);
    if (existing) {
      existing.showtimes.push(toShowtime(item));
      continue;
    }

    byFilmId.set(item.film_id, {
      film_id: item.film_id,
      title: item.title,
      year: item.year,
      genre: item.genre,
      language: item.language,
      country: item.country,
      description: item.description,
      rated: item.rated,
      awards: item.awards,
      imdb_rating: item.imdb_rating,
      rt_rating_pct: item.rt_rating_pct,
      imdb_votes: item.imdb_votes,
      imdb_url: item.imdb_url,
      imdb_id: item.imdb_id,
      tmdb_id: item.tmdb_id,
      directors: item.directors ?? null,
      similarity: item.similarity ?? null,
      lexical_rank: item.lexical_rank ?? null,
      retrieval_source: item.retrieval_source ?? null,
      match_score: includeScores ? item.match_score ?? null : null,
      match_explanation: includeScores ? item.match_explanation ?? null : null,
      showtimes: [toShowtime(item)],
    });
  }

  return [...byFilmId.values()]
    .map((film) => ({
      ...film,
      showtimes: film.showtimes.sort(
        (a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc)
      ),
    }))
    .slice(0, Number(limit) || 20);
}

function buildScreeningResults(items, { limit } = {}) {
  return [...items]
    .sort((a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc))
    .slice(0, Number(limit) || 20);
}

function normalizeAgenticIntent(intentType) {
  return ['discovery_query', 'style_reference_query', 'constraint_heavy_query'].includes(intentType)
    ? intentType
    : 'discovery_query';
}

function normalizePresentationHint(hint, intentType) {
  if (hint === 'screening_results' && intentType === 'constraint_heavy_query') {
    return 'screening_results';
  }
  return 'film_results';
}

export async function orchestrateSearch({ query, routing, filters }) {
  if (routing.mode === 'structured') {
    return handleStructured({ routing, filters });
  }
  if (routing.mode === 'degraded') {
    return handleDegraded({ query, filters });
  }
  return handleAgentic({ query, routing, filters });
}

function resolveTimeRange(dateHint, filters) {
  let gte = null;
  let lt = null;

  if (filters.date) {
    [gte, lt] = localDayToUtcRange(filters.date, TZ);
  } else if (filters.from) {
    [gte, lt] = localRangeToUtc(filters.from, filters.to, TZ);
  } else if (dateHint) {
    const resolved = resolveDateHint(dateHint);
    if (resolved.date) [gte, lt] = localDayToUtcRange(resolved.date, TZ);
    else if (resolved.from) [gte, lt] = localRangeToUtc(resolved.from, resolved.to, TZ);
  }

  if (!gte && !lt) gte = new Date();

  return { gte, lt };
}

async function handleDegraded({ query, filters }) {
  const { prisma } = await import('../lib/prismaClient.js');

  const where = { is_active: true };
  if (filters.cinemaIds?.length) where.cinema_id = { in: filters.cinemaIds };

  const screenings = await prisma.screening.findMany({
    where: {
      ...where,
      start_at_utc: { gte: new Date() },
      film: { title: { contains: query, mode: 'insensitive' } },
    },
    include: { film: true, cinema: true },
    orderBy: { start_at_utc: 'asc' },
    take: Number(filters.limit) || 20,
  });

  const items = screenings.map(mapPrismaScreening);

  return {
    mode: 'degraded',
    intent_type: null,
    result_type: items.length ? 'screening_results' : 'empty_with_fallback',
    items,
    message: items.length ? undefined : 'Search is temporarily limited. Showing title matches only.',
  };
}

async function handleStructured({ routing, filters }) {
  const { entities, date_hint } = routing;
  const { gte, lt } = resolveTimeRange(date_hint, filters);

  const cinemaIds = filters.cinemaIds?.length
    ? filters.cinemaIds
    : entities.cinema
      ? await resolveCinemaHint(entities.cinema)
      : null;

  let items = [];

  if (entities.person) {
    items = await searchByPerson({ personName: entities.person, cinemaIds, gte, lt });
  } else if (entities.film) {
    items = await searchByFilm({ filmTitle: entities.film, cinemaIds, gte, lt });
  } else if (cinemaIds?.length) {
    items = await searchByCinema({ cinemaIds, gte, lt });
  }

  if (items.length === 0) {
    const entityName = entities.person || entities.film || entities.cinema || 'that';
    return {
      mode: 'structured',
      intent_type: routing.intent_type || null,
      result_type: 'empty_with_fallback',
      items: [],
      message: `No upcoming screenings found for ${entityName}.`,
      fallback_available: true,
      fallback_hint: 'Show films with a similar style?',
    };
  }

  if (entities.person) {
    return {
      mode: 'structured',
      intent_type: 'known_person_query',
      result_type: 'person_results',
      items: buildFilmResults(items, { limit: filters.limit }),
    };
  }

  if (entities.film) {
    return {
      mode: 'structured',
      intent_type: 'known_film_query',
      result_type: 'film_showtimes',
      items: buildFilmResults(items, { limit: filters.limit }),
    };
  }

  return {
    mode: 'structured',
    intent_type: routing.intent_type || 'known_cinema_query',
    result_type: 'cinema_schedule',
    items: buildScreeningResults(items, { limit: filters.limit }),
  };
}

async function fetchConstraintScreenings({ cinemaIds, gte, lt, runtimeMax, limit }) {
  const { prisma } = await import('../lib/prismaClient.js');

  const where = {
    is_active: true,
    start_at_utc: { gte: gte || new Date() },
  };
  if (lt) where.start_at_utc.lt = lt;
  if (cinemaIds?.length) where.cinema_id = { in: cinemaIds };
  if (runtimeMax) where.runtime_min = { lte: Number(runtimeMax) };

  const screenings = await prisma.screening.findMany({
    where,
    include: { film: true, cinema: true },
    orderBy: { start_at_utc: 'asc' },
    take: Number(limit) || 20,
  });

  return screenings.map(mapPrismaScreening);
}

async function handleAgentic({ query, routing, filters }) {
  const res = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You decompose a movie search query into concrete constraints for a screening database in Vancouver. Extract as many structured constraints as possible.

IMPORTANT: "vibe_keywords" is used for semantic embedding search against a film database. Make it descriptive and rich — include mood, genre, tone, and style words. For example, instead of just "light", write "light romantic comedy fun uplifting cheerful date night".

Respond as JSON:
{
  "vibe_keywords": "rich descriptive string for semantic embedding search (multiple words)",
  "intent_type": "discovery_query" or "constraint_heavy_query" or "style_reference_query",
  "presentation_hint": "film_results" or "screening_results",
  "runtime_max": null or number in minutes,
  "cinema_hint": null or string (e.g. "rio", "cinematheque"),
  "date_hint": null or "today" or "tonight" or "tomorrow" or "this weekend",
  "avoid": null or string describing what to avoid,
  "complex": true if the query requires reasoning about social context or personal preferences, false otherwise
}

Use "constraint_heavy_query" + "screening_results" ONLY when the user mostly asks for available showtimes using hard constraints (date/time/cinema/runtime) without mood, genre, style, vibe, or recommendation quality words.
Use "discovery_query" + "film_results" when the user asks for recommendation quality, mood, style, genre, or personal preference, even if they also include hard constraints like tonight, at a cinema, or under 2 hours.
Use "style_reference_query" + "film_results" when a person/film is used as a style reference.}`,
      },
      { role: 'user', content: query },
    ],
  });

  let constraints;
  try {
    constraints = JSON.parse(res.choices[0].message.content);
  } catch {
    constraints = {
      vibe_keywords: query,
      intent_type: routing?.intent_type || 'discovery_query',
      presentation_hint: 'film_results',
      complex: false,
    };
  }

  const intentType = normalizeAgenticIntent(
    constraints.intent_type || routing?.intent_type
  );
  const presentationHint = normalizePresentationHint(
    constraints.presentation_hint,
    intentType
  );

  const cinemaIds = constraints.cinema_hint
    ? await resolveCinemaHint(constraints.cinema_hint)
    : [];

  const { gte, lt } = resolveTimeRange(constraints.date_hint, filters);

  if (presentationHint === 'screening_results') {
    const items = await fetchConstraintScreenings({
      cinemaIds: filters.cinemaIds?.length ? filters.cinemaIds : cinemaIds,
      gte,
      lt,
      runtimeMax: constraints.runtime_max,
      limit: filters.limit,
    });

    return {
      mode: 'agentic',
      intent_type: intentType,
      result_type: items.length ? 'screening_results' : 'empty_with_fallback',
      items,
      message: items.length
        ? undefined
        : 'No screenings found for those constraints.',
    };
  }

  const recallQuery = constraints.vibe_keywords || query;
  const recallCinemaIds = filters.cinemaIds?.length
    ? filters.cinemaIds
    : cinemaIds.length
      ? cinemaIds
      : null;

  let vectorCandidates = [];
  try {
    const queryVec = await embedQuery(recallQuery);
    vectorCandidates = await semanticSearch({
      queryVec,
      minSimilarity: 0.2,
      limit: 40,
      offset: 0,
      cinemaIds: recallCinemaIds,
      gte,
      lt,
      runtimeMax: constraints.runtime_max,
    });
  } catch {
    // best-effort: lexical recall can still provide candidates if embedding search fails
  }

  let lexicalCandidates = [];
  try {
    lexicalCandidates = await lexicalSearch({
      query: recallQuery,
      limit: 40,
      offset: 0,
      cinemaIds: recallCinemaIds,
      gte,
      lt,
      runtimeMax: constraints.runtime_max,
    });
  } catch {
    // best-effort: vector recall can still provide candidates if lexical search fails
  }

  const candidates = mergeCandidatePools(vectorCandidates, lexicalCandidates);

  let filtered = candidates;

  if (constraints.runtime_max) {
    filtered = filtered.filter(
      (c) => !c.runtime_min || c.runtime_min <= constraints.runtime_max
    );
  }

  const toVerify = selectVerificationCandidates(filtered);

  let scores = [];
  if (toVerify.length) {
    try {
      scores = await verifyMatches({
        query,
        candidates: toVerify,
        complex: constraints.complex === true,
      });
    } catch {
      // best-effort: if verification fails, return candidates unscored
    }
  }

  const scoreMap = new Map(scores.map((s) => [s.film_id, s]));

  const scoredItems = filtered
    .map((c) => {
      const s = scoreMap.get(c.film_id);
      return {
        ...c,
        match_score: s?.score ?? null,
        match_explanation: s?.explanation || null,
      };
    })
    .filter((c) => c.match_score === null || c.match_score >= MIN_SCORE)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));

  const items = buildFilmResults(scoredItems, {
    limit: filters.limit,
    includeScores: true,
  });

  const message = items.length === 0
    ? 'No good matches found for your query among current screenings.'
    : undefined;

  return {
    mode: 'agentic',
    intent_type: intentType,
    result_type: items.length ? 'film_results' : 'empty_with_fallback',
    items,
    message,
  };
}
