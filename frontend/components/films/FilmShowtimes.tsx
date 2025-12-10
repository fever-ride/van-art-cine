'use client';

import { useMemo, useState } from 'react';
import type { UpcomingScreening } from '@/app/lib/films';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { useWatchlist } from '@/lib/hooks/useWatchlist';

type Props = {
  upcoming: UpcomingScreening[];
  filmTitle?: string;
};

export default function FilmShowtimes({ upcoming, filmTitle }: Props) {
  const { savedIds, handleSavedChange } = useWatchlist();

  // sort soonest → latest
  const sorted = useMemo(
    () =>
      [...upcoming].sort(
        (a, b) =>
          new Date(a.start_at_utc).getTime() -
          new Date(b.start_at_utc).getTime(),
      ),
    [upcoming],
  );

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, 10);

  // Match homepage: separate date + time formatters, Vancouver tz
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone: 'America/Vancouver',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        timeZone: 'America/Vancouver',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    [],
  );

  if (!sorted.length) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-surface p-4 text-sm text-muted shadow-md md:p-6">
        No upcoming screenings.
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Header band: same cream style, film-specific title */}
      <div className="rounded-t-2xl border-b border-border bg-highlight px-4 py-3 md:px-6">
        <h2 className="text-sm font-semibold text-primary md:text-[15px]">
          Upcoming Screenings of{' '}
          <span className="font-semibold">
            {filmTitle ?? 'this film'} in Vancouver
          </span>
        </h2>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-border">
        {visible.map((s) => {
          const dt = new Date(s.start_at_utc);
          const dateStr = dateFmt.format(dt);
          const timeStr = timeFmt.format(dt);
          const initiallySaved = savedIds.has(s.id);

          return (
            <li
              key={s.id}
              className="flex flex-col gap-1 px-4 py-3 text-[13px] leading-6 md:flex-row md:items-center md:px-6 md:py-4"
            >
              {/* When (copy main table style) */}
              <div className="flex flex-col items-start leading-tight text-primary md:w-[13%]">
                <div className="text-[14px] font-medium text-muted">{dateStr}</div>
                <div className="text-[16px] font-semibold text-primary">
                  {timeStr}
                </div>
                {s.runtime_min != null && (
                  <div className="text-[13px] text-muted">{s.runtime_min} min</div>
                )}
              </div>

              {/* Cinema */}
              <div className="text-[14px] text-primary md:flex-1 md:px-6">
                {s.cinema_name}
              </div>

              {/* Actions: ticket link + watchlist button */}
              <div className="flex items-center justify-start gap-3 md:justify-end">
                {s.source_url ? (
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-border bg-highlight px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-highlight/80"
                  >
                    Get tickets on cinema site!
                  </a>
                ) : (
                  <span className="text-xs text-muted">No ticket link</span>
                )}

                {/* Keep watchlist button style consistent with main table */}
                <WatchlistButton
                  screeningId={s.id}
                  initialSaved={initiallySaved}
                  onChange={(saved) => {
                    handleSavedChange(s.id, saved);
                  }}
                  size="sm"
                  className="whitespace-nowrap"
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Show more / less */}
      {sorted.length > 10 && (
        <div className="border-t border-border px-4 py-3 md:px-6">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-gray-50"
          >
            {showAll ? 'Show less' : `Show more (${sorted.length - 10} more)`}
          </button>
        </div>
      )}
    </section>
  );
}