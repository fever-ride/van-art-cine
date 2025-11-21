'use client';

import { useState, useEffect } from 'react';
import { GUEST_KEY, getGuestSet } from '@/app/lib/guestWatchlist';
import { apiListWatchlist } from '@/app/lib/watchlist';

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