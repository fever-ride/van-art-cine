import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/**
 * GET /api/screenings
 * Query:
 *   date=YYYY-MM-DD | from=YYYY-MM-DD&to=YYYY-MM-DD
 *   venue_id, cinema_id, film_id
 *   q=string
 *   sort=time|title|imdb|rt|venue|votes|year
 *   order=asc|desc
 *   limit, offset
 */
router.get('/', async (req, res, next) => {
  try {
    // --- Parse inputs ---
    const date = req.query.date?.trim();
    const from = req.query.from?.trim();
    const to   = req.query.to?.trim();

    const venueId  = req.query.venue_id  ? Number(req.query.venue_id)  : null;
    const cinemaId = req.query.cinema_id ? Number(req.query.cinema_id) : null;
    const filmId   = req.query.film_id   ? Number(req.query.film_id)   : null;

    const q = (req.query.q || '').toString().trim().toLowerCase();

    const limitParam  = parseInt(req.query.limit  ?? '50', 10);
    const offsetParam = parseInt(req.query.offset ?? '0',  10);
    const limit  = Math.min(isNaN(limitParam)  || limitParam  <= 0 ? 50 : limitParam, 200);
    const offset = Math.max(isNaN(offsetParam) || offsetParam <  0 ?  0 : offsetParam, 0);

    const sortRaw = (req.query.sort || 'time').toString();
    const order   = (req.query.order || 'asc').toString().toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Map allowed sort keys to concrete SQL expressions
    const sortMap = {
      time:  's.start_at_utc',
      title: 'f.title',
      imdb:  'COALESCE(f.imdb_rating, -1)',         // push nulls to bottom when ASC
      rt:    'COALESCE(f.rt_rating_pct, -1)',
      venue: 'v.name',
      votes: 'COALESCE(f.imdb_votes, -1)',
      year:  'COALESCE(f.year, 0)'
    };
    const sortCol = sortMap[sortRaw] || sortMap.time;

    // --- Build SQL ---
    // Select columns in the exact order you want them in the JSON rows
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

    // Date filtering (UTC)
    if (date) {
      sql += ` AND s.start_at_utc >= ? AND s.start_at_utc < DATE_ADD(?, INTERVAL 1 DAY)`;
      params.push(`${date} 00:00:00`, `${date} 00:00:00`);
    } else {
      if (from) { sql += ` AND s.start_at_utc >= ?`; params.push(`${from} 00:00:00`); }
      else      { sql += ` AND s.start_at_utc >= UTC_TIMESTAMP()`; }

      if (to)   { sql += ` AND s.start_at_utc < DATE_ADD(?, INTERVAL 1 DAY)`; params.push(`${to} 00:00:00`); }
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
      ORDER BY ${sortCol} ${order}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.query(sql, params);

    res.json({
      total: rows.length,
      items: rows
    });
  } catch (err) {
    next(err);
  }
});

export default router;