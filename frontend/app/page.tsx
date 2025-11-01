'use client';

import { useMemo } from 'react';
import Filters from '@/components/screenings/Filters';
import ResultsTable from '@/components/screenings/ResultsTable';
import Pagination from '@/components/screenings/Pagination';
import { useScreeningsUI } from '@/lib/hooks/useScreeningsUI';
import { useScreeningsData } from '@/lib/hooks/useScreeningsData';
import { usePagination } from '@/lib/hooks/usePagination';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import type { Screening } from '@/app/lib/screenings';

export default function Home() {
  const screeningsUI = useScreeningsUI();
  const pagination = usePagination(screeningsUI.ui.limit);
  const screeningsData = useScreeningsData(screeningsUI.ui, pagination.offset);
  const watchlist = useWatchlist();

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

  const handleApplyFilters = () => {
    pagination.resetPagination();
    screeningsData.reload(0);
  };

  // Derive unique cinema options from current results
  const cinemaOptions = useMemo(
    () => {
      const m = new Map<number, string>();
      screeningsData.items.forEach(s => {
        if (typeof s.cinema_id === 'number' && s.cinema_name) {
          m.set(s.cinema_id, s.cinema_name);
        }
      });
      return Array.from(m, ([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [screeningsData.items]
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Now Playing</h1>

      <Filters
        ui={screeningsUI.ui}
        setUI={screeningsUI.setUI}
        onApply={handleApplyFilters}
        loading={screeningsData.loading}
        cinemaOptions={cinemaOptions}
      />

      {screeningsData.loading && (
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      )}
      {screeningsData.error && (
        <p className="mt-3 text-sm text-red-600">Error: {screeningsData.error}</p>
      )}
      {!screeningsData.loading && screeningsData.items.length === 0 && !screeningsData.error && (
        <p className="mt-3 text-sm text-gray-600">No screenings found.</p>
      )}

      {screeningsData.items.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <ResultsTable
            items={screeningsData.items}
            fmt={fmt}
            savedIds={watchlist.savedIds}
            onSavedChange={watchlist.handleSavedChange}
          />
        </div>
      )}

      <Pagination
        className="mt-4"
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        disablePrev={!pagination.canGoPrev || screeningsData.loading}
        disableNext={!screeningsData.hasMore || screeningsData.loading}
      />
    </main>
  );
}