import { Router } from 'express';
import { fetchScreenings } from '../models/screenings.js';
// import { normalizeTz } from '../utils/validateTz.js';

const router = Router();

// Currently backend ignores tz; 
// kept for possible future multi-timezone support.
const DEFAULT_TZ = 'America/Vancouver';

router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date?.trim();
    const from = req.query.from?.trim();
    const to   = req.query.to?.trim();

    const cinemaId = req.query.cinema_id ? Number(req.query.cinema_id) : null;
    const filmId   = req.query.film_id   ? Number(req.query.film_id)   : null;

    const q = (req.query.q || '').toString().trim().toLowerCase();

    const limitParam  = parseInt(req.query.limit  ?? '50', 10);
    const offsetParam = parseInt(req.query.offset ?? '0',  10);
    const limit  = Math.min(isNaN(limitParam)  || limitParam  <= 0 ? 50 : limitParam, 200);
    const offset = Math.max(isNaN(offsetParam) || offsetParam <  0 ?  0 : offsetParam, 0);

    const sort  = (req.query.sort  || 'time').toString();
    const order = (req.query.order || 'asc').toString();

    // Currently backend ignores tz; 
    // kept for possible future multi-timezone support.
    const tz = DEFAULT_TZ;

    const rows = await fetchScreenings({
      date, from, to,
      cinemaId, filmId,
      q, sort, order, limit, offset,
      tz,
    });

    res.json({ total: rows.length, items: rows });
  } catch (err) { next(err); }
});

export default router;