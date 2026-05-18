import OpenAI from 'openai';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function buildFilmLine(film, index, complex) {
  const desc = film.description ? film.description.slice(0, 150) : 'No description';
  let line = `${index}. ${film.title} (${film.year || '?'}) | ${film.genre || 'N/A'} | ${desc}`;
  if (complex) {
    line += ` | ${film.runtime_min || '?'}min | Awards: ${film.awards || 'N/A'}`;
  }
  return line;
}

const SIMPLE_PROMPT = (query, filmList) => `You are verifying whether films match a user's search query for a movie screening app.

User is searching for: "${query}"

Score each film 1-10 on how well it matches what the user is looking for:
- 1-3: Clearly does not match (wrong tone, genre, or mood)
- 4-5: Tangentially related but not what was asked for
- 6-7: Reasonably good match
- 8-10: Excellent match

Films:
${filmList}

Respond as JSON: { "scores": [{ "index": 1, "score": <number> }, ...] }`;

const COMPLEX_PROMPT = (query, filmList) => `You are evaluating whether films match a user's nuanced search query.

User is searching for: "${query}"

Score each film 1-10 considering:
- The explicit criteria stated in the query
- Implicit preferences (e.g. "first date" implies light tone, not too intense)
- Whether this film would actually satisfy the user's underlying need

For each film, also provide a 1-2 sentence explanation of your reasoning.

Films:
${filmList}

Respond as JSON: { "scores": [{ "index": 1, "score": <number>, "explanation": "<string>" }, ...] }`;

export async function verifyMatches({ query, candidates, complex }) {
  if (!candidates.length) return [];

  const batch = candidates.slice(0, 15);

  const filmList = batch
    .map((film, i) => buildFilmLine(film, i + 1, complex))
    .join('\n');

  const prompt = complex
    ? COMPLEX_PROMPT(query, filmList)
    : SIMPLE_PROMPT(query, filmList);

  const model = complex ? 'gpt-4o' : 'gpt-4o-mini';

  try {
    const res = await getClient().chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    const scores = parsed.scores || [];

    return scores
      .filter((s) => s.index >= 1 && s.index <= batch.length)
      .map((s) => {
        const film = batch[s.index - 1];
        return {
          film_id: film.film_id,
          score: s.score,
          explanation: complex ? s.explanation || null : null,
        };
      });
  } catch {
    return [];
  }
}
