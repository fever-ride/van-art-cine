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
  "entities": { "person": null | "name", "film": null | "title", "cinema": null | "name" },
  "date_hint": null | "today" | "tonight" | "tomorrow" | "this weekend"
}

Only populate "entities" for structured mode. For agentic mode, set all entity fields to null.`;

const AGENTIC_FALLBACK = {
  mode: 'agentic',
  entities: { person: null, film: null, cinema: null },
  date_hint: null,
};

const DEGRADED_RESPONSE = { mode: 'degraded', entities: { person: null, film: null, cinema: null }, date_hint: null };

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

    return { mode, entities, date_hint };
  } catch {
    recordFailure();

    if (getBreakerState() === 'open') {
      return DEGRADED_RESPONSE;
    }

    return AGENTIC_FALLBACK;
  }
}
