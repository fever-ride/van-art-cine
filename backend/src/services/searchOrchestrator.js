import { semanticSearch } from '../models/search.js';
import { embedQuery } from './embeddingService.js';
import { resolveDateHint } from './dateResolver.js';
import { resolveCinemaHint } from './cinemaResolver.js';
import { generateMatchExplanations } from './explanationService.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';
import OpenAI from 'openai';

const TZ = 'America/Vancouver';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export async function orchestrateSearch({ query, tier, filters }) {
  if (tier === 'agentic') {
    return handleAgentic({ query, filters });
  }
  return handleSemantic({ query, filters });
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

async function handleSemantic({ query, filters, minSimilarity = 0.3, dateHint = null }) {
  const queryVec = await embedQuery(query);
  const { gte, lt } = resolveTimeRange(dateHint, filters);

  const items = await semanticSearch({
    queryVec,
    minSimilarity,
    limit: filters.limit || 20,
    offset: filters.offset || 0,
    cinemaIds: filters.cinemaIds?.length ? filters.cinemaIds : null,
    gte,
    lt,
  });

  return { items, tier: 'semantic' };
}

async function handleAgentic({ query, filters }) {
  const res = await getClient().chat.completions.create({
    model: 'gpt-4o',
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
  "mood": "string description",
  "cinema_hint": null or string (e.g. "rio", "cinematheque"),
  "date_hint": null or "today" or "tonight" or "tomorrow" or "this weekend",
  "genre_preference": null or string,
  "avoid": null or string describing what to avoid
}`,
      },
      { role: 'user', content: query },
    ],
  });

  const constraints = JSON.parse(res.choices[0].message.content);

  const cinemaIds = constraints.cinema_hint
    ? await resolveCinemaHint(constraints.cinema_hint)
    : [];

  const mergedFilters = {
    ...filters,
    limit: 40,
    cinemaIds: filters.cinemaIds?.length ? filters.cinemaIds : cinemaIds,
  };

  const semanticResult = await handleSemantic({
    query: constraints.vibe_keywords || query,
    filters: mergedFilters,
    minSimilarity: 0.2,
    dateHint: constraints.date_hint,
  });

  let candidates = semanticResult.items;

  if (constraints.runtime_max) {
    candidates = candidates.filter(
      (c) => !c.runtime_min || c.runtime_min <= constraints.runtime_max
    );
  }

  candidates = candidates.slice(0, filters.limit || 10);

  const uniqueFilms = [];
  const seenFilmIds = new Set();
  for (const c of candidates) {
    if (!seenFilmIds.has(c.film_id)) {
      seenFilmIds.add(c.film_id);
      uniqueFilms.push(c);
    }
  }

  let explanations = [];
  if (uniqueFilms.length) {
    try {
      explanations = await generateMatchExplanations(query, constraints, uniqueFilms);
    } catch {
      // best-effort
    }
  }

  const MIN_SCORE = 5;
  const explMap = new Map(explanations.map((e) => [e.film_id, e]));

  const scoredItems = candidates
    .map((c) => {
      const expl = explMap.get(c.film_id);
      return {
        ...c,
        match_score: expl?.score ?? null,
        match_explanation: expl?.explanation || null,
      };
    })
    .filter((c) => c.match_score === null || c.match_score >= MIN_SCORE)
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));

  const message = scoredItems.length === 0
    ? 'No good matches found for your query among current screenings.'
    : undefined;

  return { items: scoredItems, tier: 'agentic', message };
}
