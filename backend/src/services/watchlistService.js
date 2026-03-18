/**
 * Watchlist service layer.
 *
 * This module exposes domain-level operations for a user's watchlist.
 * It sits between HTTP controllers and the persistence layer:
 *  - accepts already-authenticated user IDs and simple arguments
 *  - delegates DB work to watchlistModel
 *  - enforces business rules and shapes responses for controllers
 *
 * Notable behaviours:
 *  - `remove` throws a typed WatchlistError when the item is missing
 *  - `toggle` implements idempotent add/remove semantics
 *  - `importMerge` validates and de-duplicates IDs before bulk insert
 */
import {
  addWatchlistScreening,
  removeWatchlistScreening,
  isInWatchlist,
  listWatchlist,
  addManyWatchlistScreenings,
  countWatchlist,
} from '../models/watchlistModel.js';
import { WatchlistError } from '../utils/errors.js';

/**
 * Add a screening to the user's watchlist.
 *
 * Returns `{ created: boolean }` where `created=false` means the row already
 * existed and the call was effectively a no-op.
 */
export async function add({ uid, screeningId }) {
  const ok = await addWatchlistScreening({ userUid: uid, screeningId });
  return { created: ok }; // created=false means it already existed
}

/**
 * Remove a screening from the user's watchlist.
 *
 * Throws a WatchlistError with 404 status when the item is not present, so
 * controllers can surface a consistent NOT_FOUND error to clients.
 */
export async function remove({ uid, screeningId }) {
  const ok = await removeWatchlistScreening({ userUid: uid, screeningId });
  if (!ok) {
    throw new WatchlistError('Not in watchlist', 'NOT_FOUND', 404);
  }
  return { ok: true };
}

/**
 * List a user's watchlist items with optional pagination and past filtering.
 */
export async function list({ uid, limit, offset, includePast = true }) {
  const items = await listWatchlist({ userUid: uid, limit, offset, includePast });
  return items;
}

/**
 * Check whether a single screening is currently saved.
 */
export async function status({ uid, screeningId }) {
  const saved = await isInWatchlist({ userUid: uid, screeningId });
  return { saved };
}

/**
 * Toggle watchlist membership for a screening.
 *
 * If the screening is already saved, it is removed; otherwise it is added.
 * Returns the new `saved` state.
 */
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

/**
 * Import a batch of guest watchlist IDs into the authenticated user's watchlist.
 *
 * - De-duplicates IDs and drops non-positive / non-integer values as a guardrail.
 * - Uses a bulk insert model call for efficiency.
 * - Returns how many new rows were inserted and the user's total saved count
 *   after the operation.
 */
export async function importMerge({ uid, screeningIds }) {
  // de-dupe and keep only positive ints
  const unique = Array.from(new Set(screeningIds.filter(n => Number.isInteger(n) && n > 0)));
  if (unique.length === 0) return { imported: 0, totalSaved: await countWatchlist({ userUid: uid }) };

  const { inserted } = await addManyWatchlistScreenings({ userUid: uid, screeningIds: unique });
  const totalSaved = await countWatchlist({ userUid: uid });
  return { imported: inserted, totalSaved };
}