import OpenAI from 'openai';

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export async function generateMatchExplanations(query, constraints, films) {
  if (!films.length) return [];

  const filmSummaries = films.map((f) => {
    let line = `[${f.film_id}] "${f.title}" (${f.year || '?'}) — ${f.genre || 'N/A'}, ${f.runtime_min || '?'}min, ${f.cinema_name}`;
    if (f.description) line += `\n  Description: ${f.description}`;
    return line;
  }).join('\n');

  const res = await getClient().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You evaluate movie recommendations for a screening guide in Vancouver. Given the user's query and constraints, score each film on how well it matches (1-10) and explain why in 1-2 sentences.

Be honest — if a film doesn't match the user's request, give it a low score. Read each film's description carefully to judge tone and content, not just the title.

Respond as JSON: { "explanations": [{ "film_id": number, "score": number, "explanation": string }] }`,
      },
      {
        role: 'user',
        content: `Query: "${query}"\nConstraints: ${JSON.stringify(constraints)}\n\nFilms:\n${filmSummaries}`,
      },
    ],
  });

  const parsed = JSON.parse(res.choices[0].message.content);
  return parsed.explanations || [];
}
