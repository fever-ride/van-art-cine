import {
  addWatchlistScreening,
  removeWatchlistScreening,
  isInWatchlist,
  listWatchlist,
  addManyWatchlistScreenings,
  countWatchlist,
} from '../models/watchlistModel.js';

class WatchlistError extends Error {
  constructor(message, code = 'WATCHLIST_ERROR', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function add({ uid, screeningId }) {
  const ok = await addWatchlistScreening({ userUid: uid, screeningId });
  return { created: ok }; // created=false means it already existed
}

export async function remove({ uid, screeningId }) {
  const ok = await removeWatchlistScreening({ userUid: uid, screeningId });
  if (!ok) {
    throw new WatchlistError('Not in watchlist', 'NOT_FOUND', 404);
  }
  return { ok: true };
}

export async function list({ uid, limit, offset }) {
  const items = await listWatchlist({ userUid: uid, limit, offset });
  return { items };
}

export async function status({ uid, screeningId }) {
  const saved = await isInWatchlist({ userUid: uid, screeningId });
  return { saved };
}

export async function toggle({ uid, screeningId }) {
  const saved = await isInWatchlist({ userUid: uid, screeningId });
  if (saved) {
    await removeWatchlistScreening({ userUid: uid, screeningId });
    return { saved: false };
  } else {
    await addWatchlistScreening({ userUid: uid, screeningId });
    return { saved: true };
  }
}

export async function importMerge({ uid, screeningIds }) {
  // de-dupe and keep only positive ints
  const unique = Array.from(new Set(screeningIds.filter(n => Number.isInteger(n) && n > 0)));
  if (unique.length === 0) return { imported: 0, totalSaved: await countWatchlist({ userUid: uid }) };

  const { inserted } = await addManyWatchlistScreenings({ userUid: uid, screeningIds: unique });
  const totalSaved = await countWatchlist({ userUid: uid });
  return { imported: inserted, totalSaved };
}