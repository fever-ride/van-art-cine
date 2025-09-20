import { Router } from 'express';
import { getFilmById, getFilmPeople, getUpcomingForFilm } from '../models/films.js';

const router = Router();

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid id', code: 'BAD_ID' });
    }

    const film = await getFilmById(id);
    if (!film) return res.status(404).json({ error: 'Film not found', code: 'NOT_FOUND' });

    const { directors, writers, cast } = await getFilmPeople(id);
    const upcoming = await getUpcomingForFilm(id, { limit: 200 });

    res.json({ film: { ...film, directors, writers, cast }, upcoming });
  } catch (err) { next(err); }
});

export default router;