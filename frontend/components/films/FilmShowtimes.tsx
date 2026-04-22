'use client';

import { useMemo, useState } from 'react';
import type { UpcomingScreening } from '@/app/lib/films';
import { formatScreeningDate, formatScreeningTime } from '@/app/lib/formatDate';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { Button } from '@/components/ui';

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

  if (!sorted.length) {
    return (
      <section className="rounded-card border border-border bg-surface p-6 text-sm text-muted">
        No upcoming screenings.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      {/* Header */}
      <div className="border-b border-border bg-surface px-6 py-4">
        <h2 className="text-lg font-bold text-primary">
          Upcoming Screenings in Vancouver
        </h2>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-border">
        {visible.map((s) => {
          const dt = new Date(s.start_at_utc);
          const dateStr = formatScreeningDate(dt);
          const timeStr = formatScreeningTime(dt);
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
                    className="inline-flex items-center rounded-btn border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-surface-hover"
                  >
                    Get tickets
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Show less' : `Show more (${sorted.length - 10} more)`}
          </Button>
        </div>
      )}
    </section>
  );
}