import { pool } from '../db.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';

/**
 * Build SQL + params for the screenings query.
 * Accepts the same query options used by the route.
 */
export function buildScreeningsQuery(opts = {}) {
  const {
    date, from, to,
    venueId, cinemaId, filmId,
    q,
    sort = 'time',
    order = 'ASC',
    limit = 50,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  const sortMap = {
    time:  's.start_at_utc',
    title: 'f.title',
    imdb:  'COALESCE(f.imdb_rating, -1)',
    rt:    'COALESCE(f.rt_rating_pct, -1)',
    venue: 'v.name',
    votes: 'COALESCE(f.imdb_votes, -1)',
    year:  'COALESCE(f.year, 0)',
  };
  const sortCol = sortMap[sort] || sortMap.time;
  const safeOrder = (String(order).toLowerCase() === 'desc') ? 'DESC' : 'ASC';

  let sql = `
    SELECT
      s.id,
      f.title,
      s.start_at_utc,
      s.end_at_utc,
      s.runtime_min,
      s.tz,
      v.id AS venue_id,
      v.name AS venue_name,
      c.id AS cinema_id,
      c.name AS cinema_name,
      f.id AS film_id,
      f.imdb_id,
      f.tmdb_id,
      f.year,
      GROUP_CONCAT(CASE WHEN fp.role = 'director' THEN p.name END ORDER BY p.name SEPARATOR ', ') AS directors,
      f.description,
      f.rated,
      f.genre,
      f.language,
      f.country,
      f.awards,
      f.imdb_rating,
      f.rt_rating_pct,
      f.imdb_votes,
      s.source_url,
      f.imdb_url
    FROM screening s
    JOIN film   f ON f.id = s.film_id
    JOIN venue  v ON v.id = s.venue_id
    JOIN cinema c ON c.id = v.cinema_id
    LEFT JOIN film_person fp ON fp.film_id = f.id
    LEFT JOIN person      p  ON p.id = fp.person_id
    WHERE s.start_at_utc IS NOT NULL
  `;

  const params = [];

  // Date filtering
  if (date) {
    const [utcStart, utcEnd] = localDayToUtcRange(date, tz);
    if (utcStart) { sql += ' AND s.start_at_utc >= ?'; params.push(utcStart); }
    if (utcEnd)   { sql += ' AND s.start_at_utc <  ?'; params.push(utcEnd); }
  } else {
    const [utcRangeStart, utcRangeEnd] = localRangeToUtc(from, to, tz);
    if (utcRangeStart) { sql += ' AND s.start_at_utc >= ?'; params.push(utcRangeStart); }
    else               { sql += ' AND s.start_at_utc >= UTC_TIMESTAMP()'; }
    if (utcRangeEnd)   { sql += ' AND s.start_at_utc <  ?'; params.push(utcRangeEnd); }
  }

  if (Number.isFinite(venueId))  { sql += ` AND v.id = ?`; params.push(venueId); }
  if (Number.isFinite(cinemaId)) { sql += ` AND c.id = ?`; params.push(cinemaId); }
  if (Number.isFinite(filmId))   { sql += ` AND f.id = ?`; params.push(filmId); }

  if (q) {
    sql += ` AND f.normalized_title LIKE ?`;
    params.push(`%${q}%`);
  }

  sql += `
    GROUP BY s.id
    ORDER BY ${sortCol} ${safeOrder}
    LIMIT ${limit} OFFSET ${offset}
  `;

  return { sql, params };
}

export async function fetchScreenings(opts = {}) {
  const { sql, params } = buildScreeningsQuery(opts);
  const [rows] = await pool.query(sql, params);
  return rows;
}