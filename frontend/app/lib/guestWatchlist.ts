import { apiImportWatchlist } from '@/app/lib/watchlist';

/** Key used for guest watchlist in localStorage */
export const GUEST_KEY = 'guest_watchlist';

/** 
 * Retrieve guest watchlist as a Set<number>.
 * Safely handles parse errors and missing keys.
 */
export function getGuestSet(): Set<number> {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

/**
 * Save a Set<number> to localStorage as a JSON array.
 * Ensures no duplicates.
 */
export function saveGuestSet(set: Set<number>) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(Array.from(set)));
}

/** 
 * Clear guest watchlist entirely. 
 */
export function clearGuestSet() {
  localStorage.removeItem(GUEST_KEY);
}

/**
 * Helper to add or remove a single screening ID.
 * Returns the updated Set.
 */
export function toggleGuestSet(screeningId: number): Set<number> {
  const set = getGuestSet();
  if (set.has(screeningId)) set.delete(screeningId);
  else set.add(screeningId);
  saveGuestSet(set);
  return set;
}

/**
 * Merge any guest-stored screenings into the authenticated user's watchlist.
 * - If there is nothing to merge, it does nothing.
 * - On success, it clears the guest list.
 * - On failure, it leaves the guest list intact (so user can try again later).
 */
export async function mergeGuestToServer(): Promise<{ merged: number; total: number }> {
  const set = getGuestSet();
  const ids = Array.from(set);
  if (ids.length === 0) return { merged: 0, total: 0 };

  try {
    const { inserted, total } = await apiImportWatchlist(ids);
    clearGuestSet();
    // Notify other tabs to update
    window.dispatchEvent(new StorageEvent('storage', { key: GUEST_KEY, newValue: '[]' }));
    return { merged: inserted, total };
  } catch (e) {
    // Keep guest list so user can retry later
    console.warn('Merge guest watchlist failed:', e);
    return { merged: 0, total: ids.length };
  }
}