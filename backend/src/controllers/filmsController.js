import { getFilmById, getFilmPeople, getUpcomingForFilm, getRelatedFilms } from '../models/films.js';
import { fetchFilms } from '../models/screenings.js';
import { NotFoundError } from '../utils/errors.js';

const DEFAULT_TZ = 'America/Vancouver';

function splitCsvParam(raw) {
  if (!raw) return null;
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

/**
 * GET /api/films
 * @query {{ date?, from?, to?, cinema_ids?, q?, genre?, language?, limit?, offset? }}
 * @returns {200} {{ items: FilmGroup[], total: number }} — `total` is the
 *   count of distinct matching films, not screenings (see `fetchFilms`).
 */
export async function listHandler(req, res, next) {
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

    const genres    = splitCsvParam(req.query.genre);
    const languages = splitCsvParam(req.query.language);
    const eras      = splitCsvParam(req.query.era);
    const q       = (req.query.q || '').toString().trim().toLowerCase();
    const limit   = req.query.limit  ?? 20;
    const offset  = req.query.offset ?? 0;
    // express-validator's `.toFloat()`/`.toInt()` don't mutate `req.query`
    // in place in this version — convert explicitly, same reasoning as
    // screeningsController.js's listHandler.
    const minImdbRating = req.query.min_imdb != null ? Number(req.query.min_imdb) : null;
    const minRtRating   = req.query.min_rt   != null ? Number(req.query.min_rt)   : null;

    const { items, total } = await fetchFilms({
      date, from, to,
      cinemaIds,
      q, genres, languages, eras, minImdbRating, minRtRating, limit, offset,
      tz: DEFAULT_TZ,
    });

    return res.json({ items, total });
  } catch (err) { return next(err); }
}

/**
 * GET /api/films/:id
 * @param {{ id: number }}
 * @returns {200} {{ film: Film & { directors, writers, cast }, upcoming: Screening[], related: Screening[] }}
 */
export async function getByIdHandler(req, res, next) {
  try {
    const id = req.params.id;

    const film = await getFilmById(id);
    if (!film) throw new NotFoundError('Film not found');

    const { directors, writers, cast } = await getFilmPeople(id);
    const upcoming = await getUpcomingForFilm(id, { limit: 200 });
    const related = await getRelatedFilms(id);

    return res.json({ film: { ...film, directors, writers, cast }, upcoming, related });
  } catch (err) { return next(err); }
}
