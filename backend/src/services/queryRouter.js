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

- "structured": The query can be answered with deterministic SQL filters and does NOT require subjective recommendation judgment.
  This includes:
  - a SPECIFIC entity — a named director, actor, film title, or cinema — where the user wants screenings of/by/at that entity.
  - pure availability/filter queries using hard constraints like date, time, cinema, or runtime.
  Examples: "Tarantino films", "when is Nosferatu playing", "what's at the Rio this week", "tonight under 90 minutes", "what's playing tomorrow under 2 hours", "a movie for tomorrow", "any film tonight"

- "agentic": The query describes what kind of experience or film the user wants, using mood, style, genre, theme, personal preferences, or any description that requires judgment to match against films. Also use this when the user references a person/film as a STYLE REFERENCE rather than looking for that specific entity.
  Examples: "dark atmospheric noir", "light fun date movie", "something my film-buff friend would respect", "dreamy melancholic romance", "Wong Kar-wai style visual aesthetic", "light comedy tonight under 2 hours"

Key distinction:
- If the user is looking FOR a known thing or asking for objective availability constraints only → structured.
- If the user is looking for something that MATCHES a mood/style/preference description → agentic, even if the query also has hard constraints like tonight, a cinema, or under 2 hours.

Respond as JSON:
{
  "mode": "structured" | "agentic",
  "intent_type": "known_person_query" | "known_film_query" | "known_cinema_query" | "discovery_query" | "constraint_heavy_query" | "style_reference_query",
  "entities": { "person": null | "name", "film": null | "title", "cinema": null | "name" },
  "date_hint": null | "today" | "tonight" | "tomorrow" | "this weekend",
  "runtime_max": null | number in minutes
}

Only populate "entities" for structured entity queries. For structured pure constraint queries, entities may all be null.
Use "constraint_heavy_query" + "structured" for queries that only ask for available showtimes using hard constraints like date, time, cinema, or runtime.
Treat vague availability phrasing like "a movie for tomorrow" or "any film tonight" as "constraint_heavy_query" when there is no mood/style/genre preference beyond the date or runtime filter.
Do NOT use "constraint_heavy_query" when the query includes mood, genre, style, vibe, or recommendation quality words like comedy, romantic, atmospheric, fun, scary, beautiful, happy, or date night; those are "discovery_query" and should be agentic.
Use "style_reference_query" when a person or film is used as a style reference rather than the exact thing being requested.

If the query is unrelated to Vancouver movie screenings, films, cinemas, showtimes, or movie recommendations, respond with:
{
  "mode": "unsupported",
  "intent_type": "out_of_scope",
  "entities": { "person": null, "film": null, "cinema": null },
  "date_hint": null,
  "runtime_max": null
}`;

const AGENTIC_FALLBACK = {
  mode: 'agentic',
  intent_type: 'discovery_query',
  entities: { person: null, film: null, cinema: null },
  date_hint: null,
  runtime_max: null,
};

const DEGRADED_RESPONSE = {
  mode: 'degraded',
  intent_type: null,
  entities: { person: null, film: null, cinema: null },
  date_hint: null,
  runtime_max: null,
};

export const OUT_OF_SCOPE_RESPONSE = {
  mode: 'unsupported',
  intent_type: 'out_of_scope',
  entities: { person: null, film: null, cinema: null },
  date_hint: null,
  runtime_max: null,
};

export const OUT_OF_SCOPE_MESSAGE =
  'Smart Search can help you find Vancouver indie film screenings. Try asking for a film, cinema, showtime, or movie mood.';

function inferStructuredIntent(entities, parsedIntent) {
  if (parsedIntent === 'constraint_heavy_query') return 'constraint_heavy_query';
  if (entities.person) return 'known_person_query';
  if (entities.film) return 'known_film_query';
  if (entities.cinema) return 'known_cinema_query';
  return null;
}

function normalizeAgenticIntent(intentType) {
  return ['discovery_query', 'style_reference_query'].includes(intentType)
    ? intentType
    : 'discovery_query';
}

function normalizeRuntimeMax(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function hasSubjectiveSearchSignal(query) {
  return /\b(comedy|fun|funny|romantic|romance|atmospheric|dreamy|melancholic|scary|horror|beautiful|thriller|noir|anime|intense|cheerful|uplifting|happy|date night|style|vibe|like)\b/i.test(query);
}

export function inferDateHintFromQuery(query) {
  if (/\bthis weekend\b/i.test(query)) return 'this weekend';
  if (/\btomorrow\b/i.test(query)) return 'tomorrow';
  if (/\btonight\b/i.test(query)) return 'tonight';
  if (/\btoday\b/i.test(query)) return 'today';
  return null;
}

function hasHardConstraintSignal(query) {
  return inferDateHintFromQuery(query) !== null
    || /\bunder\s+\d+\s*(?:hours?|minutes?|mins?)\b/i.test(query)
    || /\b\d+\s*(?:hours?|minutes?|mins?)\s+or\s+less\b/i.test(query);
}

function hasFilmAvailabilitySignal(query) {
  return /\b(?:movie|movies|film|films|screening|screenings|showtime|showtimes|playing|what'?s on)\b/i.test(query);
}

function shouldForceConstraintStructured(query, entities) {
  if (hasSubjectiveSearchSignal(query)) return false;
  if (entities?.person || entities?.film || entities?.cinema) return false;
  if (!hasHardConstraintSignal(query)) return false;
  return hasFilmAvailabilitySignal(query) || /\bunder\s+\d+/i.test(query);
}

function buildConstraintStructuredRouting(query, parsed) {
  return {
    mode: 'structured',
    intent_type: 'constraint_heavy_query',
    entities: { person: null, film: null, cinema: null },
    date_hint: parsed.date_hint || inferDateHintFromQuery(query),
    runtime_max: normalizeRuntimeMax(parsed.runtime_max),
  };
}

function isClearlyOutOfScope(query) {
  const filmScope =
    /\b(movie|movies|film|films|cinema|screening|screenings|showtime|showtimes|director|actor|actress|genre|rio|viff|cinematheque|vancouver|tonight|tomorrow|weekend|noir|anime|horror|thriller|comedy|romance|documentary|drama)\b/i;
  const commonOffTopic =
    /\b(python|javascript|code|homework|essay|recipe|weather|stock|stocks|crypto|math|calculus|politics|relationship advice|cover letter|resume)\b/i;

  return commonOffTopic.test(query) && !filmScope.test(query);
}

export async function routeQuery(query) {
  const state = getBreakerState();

  if (isClearlyOutOfScope(query)) {
    return OUT_OF_SCOPE_RESPONSE;
  }

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

    if (parsed.mode === 'unsupported' || parsed.intent_type === 'out_of_scope') {
      return OUT_OF_SCOPE_RESPONSE;
    }

    const parsedEntities = {
      person: parsed.entities?.person || null,
      film: parsed.entities?.film || null,
      cinema: parsed.entities?.cinema || null,
    };

    if (shouldForceConstraintStructured(query, parsedEntities)) {
      return buildConstraintStructuredRouting(query, parsed);
    }

    const mode = parsed.mode === 'structured'
      || (parsed.intent_type === 'constraint_heavy_query' && !hasSubjectiveSearchSignal(query))
      ? 'structured'
      : 'agentic';
    const entities = mode === 'structured'
      ? parsedEntities
      : { person: null, film: null, cinema: null };
    const date_hint = parsed.date_hint || null;
    const runtime_max = normalizeRuntimeMax(parsed.runtime_max);
    const intent_type = mode === 'structured'
      ? inferStructuredIntent(entities, parsed.intent_type)
      : normalizeAgenticIntent(parsed.intent_type);

    return { mode, intent_type, entities, date_hint, runtime_max };
  } catch {
    recordFailure();

    if (getBreakerState() === 'open') {
      return DEGRADED_RESPONSE;
    }

    return AGENTIC_FALLBACK;
  }
}
