'use client';

import { useMemo, useState } from 'react';
import type { UpcomingScreening } from '@/app/lib/films';

type Props = { upcoming: UpcomingScreening[] };

export default function FilmShowtimes({ upcoming }: Props) {
  // sort soonest → latest
  const sorted = useMemo(
    () =>
      [...upcoming].sort(
        (a, b) =>
          new Date(a.start_at_utc).getTime() - new Date(b.start_at_utc).getTime()
      ),
    [upcoming]
  );

  // show first 10, expandable
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, 10);

  // Always format in Vancouver, 12-hour, date + time
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
      <section className="mt-6 rounded-xl border bg-white p-4 text-sm text-gray-600 shadow-sm md:p-6">
        No upcoming screenings.
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm md:p-6">
      <h2 className="mb-3 text-base font-semibold">Screenings</h2>

      <ul className="space-y-3">
        {visible.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border border-gray-200 p-3 text-sm md:p-4"
          >
            <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
              {/* When */}
              <div className="font-medium">
                {fmt.format(new Date(s.start_at_utc))}
              </div>

              {/* Cinema */}
              <div className="text-gray-700">
                {s.cinema_name}
              </div>

              {/* Link (or fallback text) */}
              <div className="text-right">
                {s.source_url ? (
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Visit cinema page
                  </a>
                ) : (
                  <span className="text-gray-500">No ticket link available</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Show more / less */}
      {sorted.length > 10 && (
        <div className="mt-4">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-medium hover:bg-gray-50"
          >
            {showAll ? 'Show less' : `Show more (${sorted.length - 10} more)`}
          </button>
        </div>
      )}
    </section>
  );
}