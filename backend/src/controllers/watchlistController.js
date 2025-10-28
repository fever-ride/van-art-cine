import * as svc from '../services/watchlistService.js';

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
  } catch (e) { return next(e); }
}

export async function addHandler(req, res, next) {
  try {
    const { screeningId } = req.body;
    const { created } = await svc.add({ uid: req.user.uid, screeningId });
    return res.status(created ? 201 : 200).json({ ok: true, created });
  } catch (e) { return next(e); }
}

export async function removeHandler(req, res, next) {
  try {
    const screeningId = Number(req.params.screeningId);
    await svc.remove({ uid: req.user.uid, screeningId });
    return res.status(204).send(); // no body
  } catch (e) { return next(e); }
}

export async function statusHandler(req, res, next) {
  try {
    const screeningId = Number(req.query.screeningId);
    const { saved } = await svc.status({ uid: req.user.uid, screeningId });
    return res.json({ saved });
  } catch (e) { return next(e); }
}

export async function toggleHandler(req, res, next) {
  try {
    const { screeningId } = req.body;
    const { saved } = await svc.toggle({ uid: req.user.uid, screeningId });
    return res.json({ saved });
  } catch (e) { return next(e); }
}

export async function importHandler(req, res, next) {
  try {
    const { screeningIds } = req.body; // already validated & toInt()’d
    const { imported, totalSaved } = await svc.importMerge({
      uid: req.user.uid,
      screeningIds,
    });
    return res.json({ ok: true, imported, totalSaved });
  } catch (e) { return next(e); }
}