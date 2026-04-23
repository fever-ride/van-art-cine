import OpenAI from 'openai';
import { prisma } from '../lib/prismaClient.js';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;

let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export async function buildFilmDocText(filmId) {
  const film = await prisma.film.findUnique({
    where: { id: filmId },
    include: {
      film_person: {
        include: { person: true },
      },
    },
  });
  if (!film) return null;

  const directors = film.film_person
    .filter((fp) => fp.role === 'director')
    .map((fp) => fp.person.name);

  const parts = [`Title: ${film.title}`];
  if (film.year) parts.push(`Year: ${film.year}`);
  if (directors.length) parts.push(`Director: ${directors.join(', ')}`);
  if (film.genre) parts.push(`Genre: ${film.genre}`);
  if (film.language) parts.push(`Language: ${film.language}`);
  if (film.country) parts.push(`Country: ${film.country}`);
  if (film.rated) parts.push(`Rated: ${film.rated}`);
  if (film.awards) parts.push(`Awards: ${film.awards}`);
  if (film.description) parts.push(`Description: ${film.description}`);
  if (film.tags?.length) parts.push(`Tags: ${film.tags.join(', ')}`);

  return parts.join('\n');
}

export async function generateEmbedding(text) {
  const res = await getClient().embeddings.create({
    model: EMBED_MODEL,
    input: text,
    dimensions: EMBED_DIM,
  });
  return res.data[0].embedding;
}

export async function upsertFilmEmbedding(filmId) {
  const docText = await buildFilmDocText(filmId);
  if (!docText) return null;

  const embedding = await generateEmbedding(docText);
  const vecLiteral = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO film_embedding (film_id, embedding, doc_text, model, created_at, updated_at)
     VALUES ($1, $2::vector, $3, $4, NOW(), NOW())
     ON CONFLICT (film_id) DO UPDATE
       SET embedding = EXCLUDED.embedding,
           doc_text = EXCLUDED.doc_text,
           model = EXCLUDED.model,
           updated_at = NOW()`,
    filmId,
    vecLiteral,
    docText,
    EMBED_MODEL
  );

  return { filmId, docText };
}

export async function embedQuery(queryText) {
  return generateEmbedding(queryText);
}
