'use client';

import { useState, useEffect } from 'react';
import { GUEST_KEY, getGuestSet } from '@/app/lib/guestWatchlist';

export function useWatchlist() {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Initialize with guest state
    setSavedIds(getGuestSet());

    // Try to fetch server state
    (async () => {
      try {
        const res = await fetch('/api/watchlist?limit=100', { credentials: 'include' });
        if (!res.ok) return; // likely 401 (guest) — keep guest state
        const data = await res.json();
        const ids = new Set<number>(data.items.map((it: any) => Number(it.screening_id)));
        setSavedIds(ids);
      } catch {
        // ignore network errors; keep guest state
      }
    })();

    // Listen for guest state changes
    function onStorage(e: StorageEvent) {
      if (e.key === GUEST_KEY) setSavedIds(getGuestSet());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleSavedChange = (screeningId: number, saved: boolean) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (saved) next.add(screeningId);
      else next.delete(screeningId);
      return next;
    });
  };

  return {
    savedIds,
    handleSavedChange
  };
}