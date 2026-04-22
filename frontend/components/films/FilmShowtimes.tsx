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
      {/* Black header like main table */}
      <div className="bg-table-header-bg px-6 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-white">
          Upcoming Screenings in Vancouver
        </h2>
      </div>

      {/* Rows like main table */}
      <ul className="divide-y divide-border">
        {visible.map((s) => {
          const dt = new Date(s.start_at_utc);
          const dateStr = formatScreeningDate(dt);
          const timeStr = formatScreeningTime(dt);
          const initiallySaved = savedIds.has(s.id);

          return (
            <li
              key={s.id}
              className="flex flex-col gap-3 px-6 py-4 text-[13px] leading-6 md:flex-row md:items-center"
            >
              {/* When */}
              <div className="flex flex-col items-start leading-tight text-primary md:w-[140px]">
                <div className="text-[14px] font-medium text-muted">{dateStr}</div>
                <div className="text-[16px] font-semibold text-primary">
                  {timeStr}
                </div>
                {s.runtime_min != null && (
                  <div className="text-[13px] text-muted">{s.runtime_min} min</div>
                )}
              </div>

              {/* Cinema */}
              <div className="text-[14px] text-primary md:flex-1">
                {s.cinema_name}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {s.source_url ? (
                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-btn bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    Get tickets
                  </a>
                ) : (
                  <span className="text-xs text-muted">No link</span>
                )}

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
        <div className="border-t border-border px-6 py-3">
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