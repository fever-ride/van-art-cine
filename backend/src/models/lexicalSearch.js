import { prisma } from '../lib/prismaClient.js';

export async function lexicalSearch({
  query,
  limit = 20,
  offset = 0,
  cinemaIds = null,
  gte = null,
  lt = null,
  runtimeMax = null,
}) {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) return [];

  const searchVector = 'film_search_vector(f.title, f.normalized_title, f.genre, f.description)';

  const conditions = ['s.is_active = true', `(${searchVector}) @@ q.tsq`];
  const params = [normalizedQuery];
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

  const whereClause = conditions.join(' AND ');

  const sql = `
    WITH q AS (
      SELECT websearch_to_tsquery('english', $1::text) AS tsq
    )
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
      ts_rank_cd((${searchVector}), q.tsq) AS lexical_rank
    FROM q
    JOIN screening s ON true
    JOIN film f ON s.film_id = f.id
    JOIN cinema c ON s.cinema_id = c.id
    WHERE ${whereClause}
    ORDER BY lexical_rank DESC, s.start_at_utc ASC
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
    similarity: null,
    lexical_rank: Number(r.lexical_rank),
    retrieval_source: 'lexical',
  }));
}
