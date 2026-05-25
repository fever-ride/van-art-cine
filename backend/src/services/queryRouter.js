import OpenAI from 'openai';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

// Circuit breaker: 5 failures in 60s opens, 30s cooldown before half-open retry
const CB_THRESHOLD = 5;
const CB_WINDOW_MS = 60_000;
const CB_COOLDOWN_MS = 30_000;

let cbState = 'closed';
let cbFailures = [];
let cbOpenedAt = null;

function recordFailure() {
  const now = Date.now();
  cbFailures.push(now);
  cbFailures = cbFailures.filter((t) => now - t < CB_WINDOW_MS);
  if (cbFailures.length >= CB_THRESHOLD) {
    cbState = 'open';
    cbOpenedAt = now;
  }
}

function recordSuccess() {
  cbState = 'closed';
  cbFailures = [];
  cbOpenedAt = null;
}

function getBreakerState() {
  if (cbState === 'closed') return 'closed';
  const elapsed = Date.now() - cbOpenedAt;
  if (elapsed >= CB_COOLDOWN_MS) return 'half-open';
  return 'open';
}

const SYSTEM_PROMPT = `You route natural language queries for a movie screening search engine in Vancouver.

Classify into exactly one mode:

- "structured": The query asks about a SPECIFIC entity — a named director, actor, film title, or cinema — and wants to find screenings of/by/at that entity.
  Examples: "Tarantino films", "when is Nosferatu playing", "what's at the Rio this week"

- "agentic": The query describes what kind of experience or film the user wants, using mood, style, genre, theme, personal preferences, or any description that requires judgment to match against films. Also use this when the user references a person/film as a STYLE REFERENCE rather than looking for that specific entity.
  Examples: "dark atmospheric noir", "light fun date movie", "something my film-buff friend would respect", "dreamy melancholic romance", "Wong Kar-wai style visual aesthetic"

Key distinction: if the user is looking FOR a known thing → structured.
If the user is looking for something that MATCHES a description → agentic.

Respond as JSON:
{
  "mode": "structured" | "agentic",
  "intent_type": "known_person_query" | "known_film_query" | "known_cinema_query" | "discovery_query" | "constraint_heavy_query" | "style_reference_query",
  "entities": { "person": null | "name", "film": null | "title", "cinema": null | "name" },
  "date_hint": null | "today" | "tonight" | "tomorrow" | "this weekend"
}

Only populate "entities" for structured mode. For agentic mode, set all entity fields to null.
Use "constraint_heavy_query" for agentic queries that mostly ask for available showtimes using hard constraints like date, time, cinema, or runtime.
Do NOT use "constraint_heavy_query" when the query includes mood, genre, style, vibe, or recommendation quality words like comedy, romantic, atmospheric, fun, scary, beautiful, or date night; those are "discovery_query".
Use "style_reference_query" when a person or film is used as a style reference rather than the exact thing being requested.`;

const AGENTIC_FALLBACK = {
  mode: 'agentic',
  intent_type: 'discovery_query',
  entities: { person: null, film: null, cinema: null },
  date_hint: null,
};

const DEGRADED_RESPONSE = {
  mode: 'degraded',
  intent_type: null,
  entities: { person: null, film: null, cinema: null },
  date_hint: null,
};

function inferStructuredIntent(entities) {
  if (entities.person) return 'known_person_query';
  if (entities.film) return 'known_film_query';
  if (entities.cinema) return 'known_cinema_query';
  return null;
}

function normalizeAgenticIntent(intentType) {
  return ['discovery_query', 'style_reference_query', 'constraint_heavy_query'].includes(intentType)
    ? intentType
    : 'discovery_query';
}

export async function routeQuery(query) {
  const state = getBreakerState();

  if (state === 'open') {
    return DEGRADED_RESPONSE;
  }

  try {
    const res = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
    });

    const parsed = JSON.parse(res.choices[0].message.content);

    recordSuccess();

    const mode = parsed.mode === 'structured' ? 'structured' : 'agentic';
    const entities = mode === 'structured'
      ? {
          person: parsed.entities?.person || null,
          film: parsed.entities?.film || null,
          cinema: parsed.entities?.cinema || null,
        }
      : { person: null, film: null, cinema: null };
    const date_hint = parsed.date_hint || null;
    const intent_type = mode === 'structured'
      ? inferStructuredIntent(entities)
      : normalizeAgenticIntent(parsed.intent_type);

    return { mode, intent_type, entities, date_hint };
  } catch {
    recordFailure();

    if (getBreakerState() === 'open') {
      return DEGRADED_RESPONSE;
    }

    return AGENTIC_FALLBACK;
  }
}
