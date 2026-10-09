import { fetchScreenings, findByIds, getScreeningFacets } from '../models/screenings.js';

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
 * GET /api/screenings
 * @query {{ date?, from?, to?, cinema_ids?, film_id?, q?, genre?, language?, sort?, order?, limit?, offset? }}
 * @returns {200} {{ items: Screening[], total: number }}
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

    // Same express-validator sanitizer caveat as min_imdb/min_rt below —
    // req.query.film_id is still a string here despite the validator's
    // `.toInt()`, which made this filter a silent no-op (buildScreeningWhere's
    // `Number.isFinite(filmId)` gate always failed on a string).
    const filmId        = req.query.film_id != null ? Number(req.query.film_id) : null;
    const q             = (req.query.q || '').toString().trim().toLowerCase();
    const limit         = req.query.limit  ?? 50;
    const offset        = req.query.offset ?? 0;
    const sort          = req.query.sort   || 'time';
    const order         = req.query.order  || 'asc';
    // express-validator's `.toFloat()`/`.toInt()` don't mutate `req.query`
    // in place in this version — convert explicitly, same as `cinemaIds`
    // above and `limit`/`offset` downstream in fetchScreenings.
    const minImdbRating = req.query.min_imdb != null ? Number(req.query.min_imdb) : null;
    const minRtRating   = req.query.min_rt   != null ? Number(req.query.min_rt)   : null;

    const { items, total } = await fetchScreenings({
      date, from, to,
      cinemaIds,
      filmId,
      q, genres, languages, eras, minImdbRating, minRtRating, sort, order, limit, offset,
      tz: DEFAULT_TZ,
    });

    return res.json({ items, total });
  } catch (err) { return next(err); }
}

/**
 * GET /api/screenings/facets
 * @returns {200} {{ cinemas: {id,name,count}[], genres: {name,count}[], languages: {name,count}[] }}
 */
export async function facetsHandler(req, res, next) {
  try {
    const facets = await getScreeningFacets();
    return res.json(facets);
  } catch (err) { return next(err); }
}

/**
 * POST /api/screenings/bulk
 * @body {{ ids: number[] }}
 * @returns {200} {{ items: Screening[] }} — same order as input IDs; unknown IDs omitted
 */
export async function bulkHandler(req, res, next) {
  try {
    const ids = [...new Set(req.body.ids)];

    if (ids.length === 0) {
      return res.json({ items: [] });
    }

    const rows = await findByIds({ ids });

    const byId = new Map(rows.map(r => [Number(r.id), r]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);

    return res.json({ items: ordered });
  } catch (err) { return next(err); }
}
