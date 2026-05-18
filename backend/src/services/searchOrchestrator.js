import { semanticSearch } from '../models/search.js';
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

export async function orchestrateSearch({ query, routing, filters }) {
  if (routing.mode === 'structured') {
    return handleStructured({ routing, filters });
  }
  if (routing.mode === 'degraded') {
    return handleDegraded({ query, filters });
  }
  return handleAgentic({ query, filters });
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

  const items = screenings.map((s) => ({
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
    match_score: null,
    match_explanation: null,
  }));

  return { mode: 'structured', items, message: items.length ? undefined : 'Search is temporarily limited. Showing title matches only.' };
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
      items: [],
      message: `No upcoming screenings found for ${entityName}.`,
      fallback_available: true,
      fallback_hint: 'Show films with a similar style?',
    };
  }

  return { mode: 'structured', items };
}

async function handleAgentic({ query, filters }) {
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
  "runtime_max": null or number in minutes,
  "cinema_hint": null or string (e.g. "rio", "cinematheque"),
  "date_hint": null or "today" or "tonight" or "tomorrow" or "this weekend",
  "avoid": null or string describing what to avoid,
  "complex": true if the query requires reasoning about social context or personal preferences, false otherwise
}`,
      },
      { role: 'user', content: query },
    ],
  });

  let constraints;
  try {
    constraints = JSON.parse(res.choices[0].message.content);
  } catch {
    constraints = { vibe_keywords: query, complex: false };
  }

  const cinemaIds = constraints.cinema_hint
    ? await resolveCinemaHint(constraints.cinema_hint)
    : [];

  const { gte, lt } = resolveTimeRange(constraints.date_hint, filters);

  const queryVec = await embedQuery(constraints.vibe_keywords || query);

  const candidates = await semanticSearch({
    queryVec,
    minSimilarity: 0.2,
    limit: 40,
    offset: 0,
    cinemaIds: filters.cinemaIds?.length ? filters.cinemaIds : cinemaIds.length ? cinemaIds : null,
    gte,
    lt,
  });

  let filtered = candidates;

  if (constraints.runtime_max) {
    filtered = filtered.filter(
      (c) => !c.runtime_min || c.runtime_min <= constraints.runtime_max
    );
  }

  const uniqueFilms = [];
  const seenFilmIds = new Set();
  for (const c of filtered) {
    if (!seenFilmIds.has(c.film_id)) {
      seenFilmIds.add(c.film_id);
      uniqueFilms.push(c);
    }
  }

  const toVerify = uniqueFilms.slice(0, MAX_VERIFY_CANDIDATES);

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

  const items = scoredItems.slice(0, Number(filters.limit) || 20);

  const message = items.length === 0
    ? 'No good matches found for your query among current screenings.'
    : undefined;

  return { mode: 'agentic', items, message };
}
