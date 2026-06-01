import { prisma } from '../lib/prismaClient.js';

export async function semanticSearch({
  queryVec,
  minSimilarity = 0.3,
  limit = 20,
  offset = 0,
  cinemaIds = null,
  gte = null,
  lt = null,
  runtimeMax = null,
}) {
  const vecLiteral = `[${queryVec.join(',')}]`;

  const conditions = ['s.is_active = true'];
  const params = [vecLiteral];
  let idx = 2;

  if (gte) {
    conditions.push(`s.start_at_utc >= $${idx}::timestamp`);
    params.push(gte);
    idx++;
  }
  if (lt) {
    conditions.push(`s.start_at_utc < $${idx}::timestamp`);
    params.push(lt);
    idx++;
  }
  if (cinemaIds?.length) {
    conditions.push(`s.cinema_id = ANY($${idx}::int[])`);
    params.push(cinemaIds);
    idx++;
  }
  if (runtimeMax) {
    conditions.push(`s.runtime_min <= $${idx}::int`);
    params.push(Number(runtimeMax));
    idx++;
  }

  conditions.push(`1 - (fe.embedding <=> $1::vector) >= $${idx}::float`);
  params.push(minSimilarity);
  idx++;

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      s.id,
      s.start_at_utc,
      s.end_at_utc,
      s.runtime_min,
      s.tz,
      s.source_url,
      f.id AS film_id,
      f.title,
      f.year,
      f.genre,
      f.language,
      f.country,
      f.description,
      f.rated,
      f.awards,
      f.imdb_rating,
      f.rt_rating_pct,
      f.imdb_votes,
      f.imdb_url,
      f.imdb_id,
      f.tmdb_id,
      c.id AS cinema_id,
      c.name AS cinema_name,
      1 - (fe.embedding <=> $1::vector) AS similarity
    FROM screening s
    JOIN film f ON s.film_id = f.id
    JOIN film_embedding fe ON f.id = fe.film_id
    JOIN cinema c ON s.cinema_id = c.id
    WHERE ${whereClause}
    ORDER BY similarity DESC, s.start_at_utc ASC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  params.push(Number(limit), Number(offset));

  const rows = await prisma.$queryRawUnsafe(sql, ...params);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    start_at_utc: r.start_at_utc,
    end_at_utc: r.end_at_utc,
    runtime_min: r.runtime_min,
    tz: r.tz,
    cinema_id: r.cinema_id,
    cinema_name: r.cinema_name,
    film_id: r.film_id,
    year: r.year,
    genre: r.genre,
    language: r.language,
    country: r.country,
    description: r.description,
    rated: r.rated,
    awards: r.awards,
    imdb_rating: r.imdb_rating ? Number(r.imdb_rating) : null,
    rt_rating_pct: r.rt_rating_pct,
    imdb_votes: r.imdb_votes,
    imdb_url: r.imdb_url,
    imdb_id: r.imdb_id,
    tmdb_id: r.tmdb_id,
    source_url: r.source_url,
    directors: null,
    similarity: Number(r.similarity),
    lexical_rank: null,
    retrieval_source: 'vector',
  }));
}
