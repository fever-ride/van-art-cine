import { Router } from 'express';
import { fetchScreenings, findByIds } from '../models/screenings.js';
// import { normalizeTz } from '../utils/validateTz.js';

const router = Router();

// Currently backend ignores tz;
// kept for possible future multi-timezone support.
const DEFAULT_TZ = 'America/Vancouver';

/* -------- List/search screenings (existing) -------- */
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

    // still support the old cinema_id
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
      cinemaIds,  // array
      cinemaId,   // old param
      filmId,
      q, sort, order, limit, offset,
      tz,
    });

    res.json({ total: rows.length, items: rows });
  } catch (err) { next(err); }
});

/* -------- Bulk by IDs --------
   Body: { ids: number[] }
   Returns: { items: Screening[] } in the same order as input IDs (unknown IDs omitted)
*/
router.post('/bulk', async (req, res, next) => {
  try {
    const raw = req.body?.ids;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }

    // to numbers, filter valid, de-dupe, cap size
    const seen = new Set();
    const ids = [];
    for (const x of raw) {
      const n = Number(x);
      if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
        seen.add(n);
        ids.push(n);
      }
      if (ids.length >= 500) break; // safety cap
    }

    if (ids.length === 0) {
      return res.json({ items: [] });
    }

    const rows = await findByIds({ ids });

    // preserve input order, skip missing
    const byId = new Map(rows.map(r => [Number(r.id), r]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);

    return res.json({ items: ordered });
  } catch (err) { next(err); }
});

export default router;