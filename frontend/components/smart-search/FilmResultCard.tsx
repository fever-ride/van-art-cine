'use client';

import Link from 'next/link';
import type { SmartSearchFilmResult } from '@/app/lib/smartSearch';
import { formatGenre } from '@/app/lib/formatGenre';
import { formatScreeningDate, formatScreeningTime } from '@/app/lib/formatDate';
import WatchlistButton from '@/components/watchlist/WatchlistButton';

type Props = {
  readonly film: SmartSearchFilmResult;
  readonly savedIds?: Set<number>;
  readonly onSavedChange?: (screeningId: number, saved: boolean) => void;
  readonly showFilmHeader?: boolean;
};

export default function FilmResultCard({
  film,
  savedIds,
  onSavedChange,
  showFilmHeader = true,
}: Props) {
  const year = film.year ? ` (${film.year})` : '';
  const genres = formatGenre(film.genre);

  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      {showFilmHeader && (
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-[18px] font-semibold text-primary">
            <Link
              href={`/films/${film.film_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {film.title}
              {year}
            </Link>
          </h3>

          {film.directors && (
            <p className="mt-1 text-[13px] text-muted">{film.directors}</p>
          )}

          {genres.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span
                  key={g}
                  className="inline-flex items-center rounded-full bg-pill px-2.5 py-1 text-[12px] font-semibold text-primary"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {film.description && (
            <p className="mt-3 text-sm leading-relaxed text-primary">{film.description}</p>
          )}
        </div>
      )}

      <ul className="divide-y divide-border">
        {film.showtimes.map((showtime) => {
          const dt = new Date(showtime.start_at_utc);
          const dateStr = formatScreeningDate(dt);
          const timeStr = formatScreeningTime(dt);

          return (
            <li
              key={showtime.id}
              className="flex flex-col gap-3 px-6 py-4 text-[13px] leading-6 md:flex-row md:items-center"
            >
              <div className="flex flex-col items-start leading-tight text-primary md:w-[140px]">
                <div className="text-[14px] font-medium text-muted">{dateStr}</div>
                <div className="text-[16px] font-semibold text-primary">{timeStr}</div>
                {showtime.runtime_min != null && (
                  <div className="text-[13px] text-muted">{showtime.runtime_min} min</div>
                )}
              </div>

              <div className="text-[14px] text-primary md:flex-1">{showtime.cinema_name}</div>

              <div className="flex items-center gap-3">
                {showtime.source_url ? (
                  <a
                    href={showtime.source_url}
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
                  screeningId={showtime.id}
                  initialSaved={savedIds?.has(showtime.id)}
                  onChange={(saved) => onSavedChange?.(showtime.id, saved)}
                  size="sm"
                  className="whitespace-nowrap"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
