import { Router } from 'express';
import { fetchScreenings, findByIds } from '../models/screenings.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

// Currently backend ignores tz;
// kept for possible future multi-timezone support.
const DEFAULT_TZ = 'America/Vancouver';

/* -------- List/search screenings -------- */
router.get('/', async (req, res, next) => {
  try {
    const date = req.query.date?.trim();
    const from = req.query.from?.trim();
    const to   = req.query.to?.trim();

    let cinemaIds = null;
    const cinemaIdsParam = req.query.cinema_ids;
    if (cinemaIdsParam) {
      cinemaIds = cinemaIdsParam
        .split(',')
        .map(id => Number(id.trim()))
        .filter(n => Number.isFinite(n) && n > 0);
      
      if (cinemaIds.length === 0) cinemaIds = null;
    }

    const cinemaId = req.query.cinema_id ? Number(req.query.cinema_id) : null;
    
    const filmId = req.query.film_id ? Number(req.query.film_id) : null;

    const q = (req.query.q || '').toString().trim().toLowerCase();

    const limitParam  = parseInt(req.query.limit  ?? '50', 10);
    const offsetParam = parseInt(req.query.offset ?? '0',  10);
    const limit  = Math.min(isNaN(limitParam)  || limitParam  <= 0 ? 50 : limitParam, 200);
    const offset = Math.max(isNaN(offsetParam) || offsetParam <  0 ?  0 : offsetParam, 0);

    const sort  = (req.query.sort  || 'time').toString();
    const order = (req.query.order || 'asc').toString();

    const tz = DEFAULT_TZ;

    const rows = await fetchScreenings({
      date, from, to,
      cinemaIds,
      cinemaId,
      filmId,
      q, sort, order, limit, offset,
      tz,
    });

    res.json({ total: rows.length, items: rows });
  } catch (err) { return next(err); }
});

/**
 * POST /api/screenings/bulk
 * @body {{ ids: number[] }}
 * @returns {200} {{ items: Screening[] }} — same order as input IDs; unknown IDs omitted
 */
router.post('/bulk', async (req, res, next) => {
  try {
    const raw = req.body?.ids;
    if (!Array.isArray(raw)) {
      throw new ValidationError('ids must be an array', 'BAD_REQUEST');
    }

    const seen = new Set();
    const ids = [];
    for (const x of raw) {
      const n = Number(x);
      if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
        seen.add(n);
        ids.push(n);
      }
      if (ids.length >= 500) break;
    }

    if (ids.length === 0) {
      return res.json({ items: [] });
    }

    const rows = await findByIds({ ids });

    const byId = new Map(rows.map(r => [Number(r.id), r]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);

    return res.json({ items: ordered });
  } catch (err) { return next(err); }
});

export default router;
