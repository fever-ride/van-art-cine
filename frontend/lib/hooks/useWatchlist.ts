'use client';

import { useState, useEffect } from 'react';
import { GUEST_KEY, getGuestSet } from '@/app/lib/guestWatchlist';
import { apiListWatchlist } from '@/app/lib/watchlist';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Hook for tracking which screenings are saved in the watchlist.
 *
 * Source depends on who is signed in (from `useAuth`, the app's single auth
 * state) and is reloaded whenever that changes — so signing in or out
 * updates every Watchlist button immediately, no page refresh:
 * - guest: the localStorage guest list (kept in sync across tabs via the
 *   `storage` event).
 * - signed in: the account's list from the server. Guest-storage events are
 *   ignored here — sign-in merges then clears the guest list, and that
 *   "cleared" event must not wipe the account's saved marks.
 * - loading: keep what we have until auth is known.
 *
 * API:
 * - `savedIds`: Set of screening IDs shown as saved.
 * - `handleSavedChange(screeningId, saved)`: update after a toggle
 *   (called from `ScreeningList` / `WatchlistButton`).
 *
 * This hook does not perform mutations itself.
 */

type WatchlistItem = { screening_id: number | string };
type WatchlistResponse = { items: WatchlistItem[] };

export function useWatchlist() {
  const { status, user } = useAuth();
  const uid = user?.uid ?? null;
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'guest') {
      setSavedIds(getGuestSet());
      const onStorage = (e: StorageEvent) => {
        if (e.key === GUEST_KEY) setSavedIds(getGuestSet());
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }

    // Signed in: load this account's list. `cancelled` drops a late
    // response if auth changes again before it arrives.
    let cancelled = false;
    (async () => {
      try {
        const data: WatchlistResponse = await apiListWatchlist({ limit: 100 });
        if (cancelled) return;
        setSavedIds(new Set((data.items ?? []).map((it) => Number(it.screening_id))));
      } catch {
        // Keep the current marks; a toggle will surface real errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, uid]);

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