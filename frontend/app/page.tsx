'use client';

import { useMemo } from 'react';
import Filters from '@/components/screenings/Filters';
import ResultsTable from '@/components/screenings/ResultsTable';
import Pagination from '@/components/screenings/Pagination';
import { useScreenings } from '@/lib/useScreenings';

export default function Home() {
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
          <ResultsTable items={items} fmt={fmt} />
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