'use client';

import { useState, useEffect } from 'react';
import { GUEST_KEY, getGuestSet } from '@/app/lib/guestWatchlist';
import { apiListWatchlist } from '@/app/lib/watchlist';

/**
 * Hook for tracking which screenings are saved in the watchlist.
 *
 * Behavior on mount:
 * - Initializes `savedIds` from the guest watchlist (localStorage via `getGuestSet`).
 * - Then tries to load the authenticated watchlist with `apiListWatchlist({ limit: 100 })`.
 *   If this succeeds, it replaces the Set with IDs from the server.
 *   If it fails (e.g. user is a guest or the request errors), it quietly keeps
 *   the guest state and does not surface an error.
 *
 * Cross-tab sync:
 * - Registers a `storage` event listener for `GUEST_KEY` so multiple tabs
 *   stay in sync when the guest watchlist changes (e.g. after a merge or toggle).
 *
 * API:
 * - Returns:
 *   - `savedIds`: a `Set<number>` of screening IDs considered saved in the UI.
 *   - `handleSavedChange(screeningId, saved)`: helper to update the Set after
 *     a successful add/remove/toggle operation (typically called from
 *     components like `ResultsTable` or `WatchlistButton`).
 *
 * This hook does not perform mutations itself; it is a read/derived state
 * layer on top of the watchlist APIs and guest storage.
 */

type WatchlistItem = { screening_id: number | string };
type WatchlistResponse = { items: WatchlistItem[] };

export function useWatchlist() {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Initialize from guest storage
    setSavedIds(getGuestSet());

    // Try loading authenticated watchlist
    (async () => {
      try {
        const data: WatchlistResponse = await apiListWatchlist({ limit: 100 });
        const ids = new Set<number>(
          (data.items ?? []).map((it) => Number(it.screening_id))
        );
        setSavedIds(ids);
      } catch {
        // User is likely a guest or request failed;
        // keep using guest state
      }
    })();

    // Sync guest watchlist across tabs
    function onStorage(e: StorageEvent) {
      if (e.key === GUEST_KEY) {
        setSavedIds(getGuestSet());
      }
    }
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleSavedChange = (screeningId: number, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(screeningId);
      else next.delete(screeningId);
      return next;
    });
  };

  return {
    savedIds,
    handleSavedChange,
  };
}