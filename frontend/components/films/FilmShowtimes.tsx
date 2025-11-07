'use client';

import { useMemo, useState } from 'react';
import type { UpcomingScreening } from '@/app/lib/films';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { useWatchlist } from '@/lib/hooks/useWatchlist';

type Props = {
  upcoming: UpcomingScreening[];
  onSavedChange?: (screeningId: number, saved: boolean) => void;
};

export default function FilmShowtimes({ upcoming, onSavedChange }: Props) {
  const { savedIds, handleSavedChange } = useWatchlist();

  // sort soonest → latest
  const sorted = useMemo(
    () =>
      [...upcoming].sort(
        (a, b) =>
          new Date(a.start_at_utc).getTime() - new Date(b.start_at_utc).getTime()
      ),
    [upcoming]
  );

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, 10);

  // Vancouver time, ticketing-style format
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone: 'America/Vancouver',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    []
  );

  if (!sorted.length) {
    return (
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-md md:p-6">
        No upcoming screenings.
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
      {/* cream header, like homepage table */}
      <div className="rounded-t-2xl border-b border-gray-200 bg-[#FFF8E7] px-4 py-2">
        <h2 className="text-[15px] font-semibold text-gray-800">Screenings</h2>
      </div>

      <div className="p-3 md:p-4">
        <ul className="space-y-3 md:space-y-4">
          {visible.map((s) => {
            const when = fmt.format(new Date(s.start_at_utc));
            const initiallySaved = savedIds.has(s.id);

            return (
              <li
                key={s.id}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm md:px-5 md:py-4"
              >
                {/* layout mirrors home page rows */}
                <div className="grid gap-2 md:grid-cols-[1.3fr_1.2fr_auto] md:items-center">
                  {/* When */}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{when}</div>
                  </div>

                  {/* Cinema */}
                  <div className="min-w-0 text-gray-800">
                    {s.cinema_name}
                  </div>

                  {/* Actions: visit link + watchlist button */}
                  <div className="flex items-center justify-end gap-5">
                    {s.source_url ? (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-[#5C8EA7] transition-colors hover:bg-white/80"
                      >
                        Get a ticket at cinema page!
                      </a>
                    ) : (
                      <span className="text-xs text-gray-500">No ticket link</span>
                    )}

                    {/* Use md to match homepage button scale */}
                    <WatchlistButton
                      screeningId={s.id}
                      initialSaved={initiallySaved}
                      onChange={(saved) => {
                        handleSavedChange(s.id, saved);
                        onSavedChange?.(s.id, saved);
                      }}
                      size="sm"
                      className="whitespace-nowrap"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Show more / less control */}
        {sorted.length > 10 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50"
            >
              {showAll ? 'Show less' : `Show more (${sorted.length - 10} more)`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}