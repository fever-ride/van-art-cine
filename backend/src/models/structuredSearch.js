import { prisma } from '../lib/prismaClient.js';

function mapRow(r) {
  return {
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
    similarity: null,
    directors: null,
  };
}

export async function searchByPerson({ personName, cinemaIds = null, gte = null, lt = null }) {
  const conditions = ['s.is_active = true'];
  const params = [];
  let idx = 1;

  conditions.push(`p.name ILIKE $${idx}::text`);
  params.push(`%${personName}%`);
  idx++;

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
      c.name AS cinema_name
    FROM screening s
    JOIN film f ON s.film_id = f.id
    JOIN film_person fp ON f.id = fp.film_id
    JOIN person p ON fp.person_id = p.id
    JOIN cinema c ON s.cinema_id = c.id
    WHERE ${whereClause}
    ORDER BY s.start_at_utc ASC
    LIMIT 30
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return rows.map(mapRow);
}

export async function searchByFilm({ filmTitle, cinemaIds = null, gte = null, lt = null }) {
  const conditions = ['s.is_active = true'];
  const params = [];
  let idx = 1;

  const normalizedTitle = filmTitle.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();

  conditions.push(`(f.title ILIKE $${idx}::text OR f.normalized_title ILIKE $${idx + 1}::text)`);
  params.push(`%${filmTitle}%`, `%${normalizedTitle}%`);
  idx += 2;

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
      c.name AS cinema_name
    FROM screening s
    JOIN film f ON s.film_id = f.id
    JOIN cinema c ON s.cinema_id = c.id
    WHERE ${whereClause}
    ORDER BY s.start_at_utc ASC
    LIMIT 30
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return rows.map(mapRow);
}

export async function searchByCinema({ cinemaIds, gte = null, lt = null }) {
  const conditions = ['s.is_active = true'];
  const params = [];
  let idx = 1;

  if (cinemaIds?.length) {
    conditions.push(`s.cinema_id = ANY($${idx}::int[])`);
    params.push(cinemaIds);
    idx++;
  }

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
      c.name AS cinema_name
    FROM screening s
    JOIN film f ON s.film_id = f.id
    JOIN cinema c ON s.cinema_id = c.id
    WHERE ${whereClause}
    ORDER BY s.start_at_utc ASC
    LIMIT 30
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return rows.map(mapRow);
}
