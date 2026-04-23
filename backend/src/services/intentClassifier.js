import OpenAI from 'openai';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const SYSTEM_PROMPT = `You are a query classifier for a movie screening search engine in Vancouver.
Classify the user's search query into exactly one tier:

- "semantic": The query describes a mood, theme, style, genre, director, or any topic that can be answered by finding semantically similar films. Examples: "dark atmospheric noir", "dreamy melancholic romance", "wong kar-wai style", "visually stunning animation".

- "agentic": The query has hard constraints that need precise filtering (time, duration, location) OR multiple soft constraints combined with personal preferences OR requires reasoning/inference. Examples: "not too long for a first date, east side", "tonight, something light", "a movie my film-buff friend would respect but my partner won't hate".

Key distinction: if the query ONLY describes what kind of film → semantic. If it includes constraints like time, duration, area, or complex personal preferences → agentic.

Respond as JSON only:
{
  "tier": "semantic" | "agentic"
}`;

export async function classifyQuery(query) {
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

    const tier = parsed.tier === 'agentic' ? 'agentic' : 'semantic';

    return { tier };
  } catch {
    return { tier: 'semantic' };
  }
}
