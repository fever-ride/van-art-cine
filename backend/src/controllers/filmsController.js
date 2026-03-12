import { getFilmById, getFilmPeople, getUpcomingForFilm } from '../models/films.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * GET /api/films/:id
 * @param {{ id: number }}
 * @returns {200} {{ film: Film & { directors, writers, cast }, upcoming: Screening[] }}
 */
export async function getByIdHandler(req, res, next) {
  try {
    const id = req.params.id;

    const film = await getFilmById(id);
    if (!film) throw new NotFoundError('Film not found');

    const { directors, writers, cast } = await getFilmPeople(id);
    const upcoming = await getUpcomingForFilm(id, { limit: 200 });

    return res.json({ film: { ...film, directors, writers, cast }, upcoming });
  } catch (err) { return next(err); }
}
