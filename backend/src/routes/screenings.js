import { Router } from 'express';
import { fetchScreenings } from '../models/screenings.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
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

    const sort  = (req.query.sort  || 'time').toString();
    const order = (req.query.order || 'asc').toString();

    const rows = await fetchScreenings({
      date, from, to,
      venueId, cinemaId, filmId,
      q, sort, order, limit, offset
    });

    res.json({ total: rows.length, items: rows });
  } catch (err) { next(err); }
});

export default router;