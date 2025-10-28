'use client';

import { useMemo, useState, useEffect } from 'react';
import Filters from '@/components/screenings/Filters';
import ResultsTable from '@/components/screenings/ResultsTable';
import Pagination from '@/components/screenings/Pagination';
import { GUEST_KEY, getGuestSet } from '@/app/lib/guestWatchlist';
import { useScreenings } from '@/lib/useScreenings';


export default function Home() {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  // 1) Seed from localStorage immediately (so UI matches guest state on refresh)
  // 2) Then try server; if authenticated, overwrite with server set.
  useEffect(() => {
    // seed from guest storage first (no flicker)
    setSavedIds(getGuestSet());

    // then try server
    (async () => {
      try {
        const res = await fetch('/api/watchlist?limit=100', { credentials: 'include' });
        if (!res.ok) return; // likely 401 (guest) — keep guest state
        const data = await res.json();
        const ids = new Set<number>(data.items.map((it: any) => Number(it.screening_id)));
        setSavedIds(ids);
      } catch {
        // network error — keep guest state
      }
    })();

    // keep in sync if localStorage changes in this or other tabs
    function onStorage(e: StorageEvent) {
      if (e.key === GUEST_KEY) {
        setSavedIds(getGuestSet());
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    []
  );

  const {
    ui, setUI,
    data: { items, loading, err, limit, offset, hasMore },
    actions: { load, prevPage, nextPage, applyFilters },
  } = useScreenings();

  // Helper for when child button toggles
  function handleSavedChange(screeningId: number, saved: boolean) {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (saved) next.add(screeningId);
      else next.delete(screeningId);
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Now Playing</h1>

      <Filters ui={ui} setUI={setUI} onApply={() => applyFilters()} loading={loading} />

      {loading && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
      {err && <p className="mt-3 text-sm text-red-600">Error: {err}</p>}
      {!loading && items.length === 0 && !err && (
        <p className="mt-3 text-sm text-gray-600">No screenings found.</p>
      )}

      {items.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <ResultsTable 
          items={items} 
          fmt={fmt} 
          savedIds={savedIds}
          onSavedChange={handleSavedChange}
        />
        </div>
      )}

      <Pagination
        className="mt-4"
        onPrev={prevPage}
        onNext={nextPage}
        disablePrev={offset === 0 || loading}
        disableNext={!hasMore || loading}
      />
    </main>
  );
}