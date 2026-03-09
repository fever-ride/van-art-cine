import * as svc from '../services/watchlistService.js';

/**
 * GET /api/watchlist
 * @query {{ limit?: number, offset?: number, includePast?: 'true'|'false' }}
 * @returns {200} {{ items: WatchlistRow[] }}
 */
export async function listHandler(req, res, next) {
  try {
    const { limit = 100, offset = 0, includePast } = req.query;
    const include = includePast === undefined ? true : includePast === 'true';
    const items = await svc.list({
      uid: req.user.uid,
      limit: Number(limit),
      offset: Number(offset),
      includePast: include
    });
    return res.json({ items });
  } catch (err) { return next(err); }
}

/**
 * POST /api/watchlist
 * @body {{ screeningId: number }}
 * @returns {201} {{ ok: true, created: true }}  — newly added
 * @returns {200} {{ ok: true, created: false }} — already existed
 */
export async function addHandler(req, res, next) {
  try {
    const { screeningId } = req.body;
    const { created } = await svc.add({ uid: req.user.uid, screeningId });
    return res.status(created ? 201 : 200).json({ ok: true, created });
  } catch (err) { return next(err); }
}

/**
 * DELETE /api/watchlist/:screeningId
 * @param {{ screeningId: number }}
 * @returns {204} — no body
 */
export async function removeHandler(req, res, next) {
  try {
    const screeningId = Number(req.params.screeningId);
    await svc.remove({ uid: req.user.uid, screeningId });
    return res.status(204).send();
  } catch (err) { return next(err); }
}

/**
 * GET /api/watchlist/status
 * @query {{ screeningId: number }}
 * @returns {200} {{ saved: boolean }}
 */
export async function statusHandler(req, res, next) {
  try {
    const screeningId = Number(req.query.screeningId);
    const { saved } = await svc.status({ uid: req.user.uid, screeningId });
    return res.json({ saved });
  } catch (err) { return next(err); }
}

/**
 * POST /api/watchlist/toggle
 * @body {{ screeningId: number }}
 * @returns {200} {{ saved: boolean }}
 */
export async function toggleHandler(req, res, next) {
  try {
    const { screeningId } = req.body;
    const { saved } = await svc.toggle({ uid: req.user.uid, screeningId });
    return res.json({ saved });
  } catch (err) { return next(err); }
}

/**
 * POST /api/watchlist/import
 * @body {{ screeningIds: number[] }}
 * @returns {200} {{ inserted: number, total: number }}
 */
export async function importHandler(req, res, next) {
  try {
    const { screeningIds } = req.body;
    const { imported, totalSaved } = await svc.importMerge({
      uid: req.user.uid,
      screeningIds,
    });
    return res.json({ inserted: imported, total: totalSaved });
  } catch (err) { return next(err); }
}
