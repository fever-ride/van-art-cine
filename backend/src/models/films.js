import { pool } from '../db.js';

export async function getFilmById(id) {
  const sql = `
    SELECT
      f.id, f.title, f.year, f.description, f.rated, f.genre, f.language, f.country, f.awards,
      f.imdb_id, f.tmdb_id, f.imdb_url,
      f.imdb_rating, f.rt_rating_pct, f.imdb_votes
    FROM film f
    WHERE f.id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [id]);
  return rows[0] || null;
}

export async function getFilmPeople(id) {
  const sql = `
    SELECT fp.role, p.name
    FROM film_person fp
    JOIN person p ON p.id = fp.person_id
    WHERE fp.film_id = ?
    ORDER BY
      CASE fp.role
        WHEN 'director' THEN 1
        WHEN 'writer'   THEN 2
        WHEN 'cast'     THEN 3
        ELSE 4
      END, p.name ASC
  `;
  const [rows] = await pool.query(sql, [id]);
  const directors = [], writers = [], cast = [];
  for (const r of rows) {
    if (r.role === 'director') directors.push(r.name);
    else if (r.role === 'writer') writers.push(r.name);
    else if (r.role === 'cast') cast.push(r.name);
  }
  return { directors, writers, cast };
}

export async function getUpcomingForFilm(id, { limit = 200 } = {}) {
  const sql = `
    SELECT
      s.id,                -- screening id
      f.title,             -- film title
      s.start_at_utc,
      s.end_at_utc,
      s.runtime_min,
      c.id   AS cinema_id,
      c.name AS cinema_name,
      s.source_url
    FROM screening s
    JOIN film   f ON f.id = s.film_id
    JOIN cinema c ON c.id = s.cinema_id
    WHERE s.film_id = ?
      AND s.is_active = 1
      AND s.start_at_utc >= UTC_TIMESTAMP()
    ORDER BY s.start_at_utc ASC
    LIMIT ?
  `;
  const [rows] = await pool.query(sql, [id, limit]);
  return rows;
}