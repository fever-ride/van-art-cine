'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import type { Screening } from '@/app/lib/screenings';
import {
  formatScreeningDate,
  formatScreeningTime,
  formatScreeningDateTime,
} from '@/app/lib/formatDate';
import WatchlistButton from '@/components/watchlist/WatchlistButton';

type Props = {
  readonly items: Screening[];
  readonly savedIds?: Set<number>;
  readonly onSavedChange?: (screeningId: number, saved: boolean) => void;
};

export default function ResultsTable({ items, savedIds, onSavedChange }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Helper: type guard for string
  function isNonEmptyString(x: unknown): x is string {
    return typeof x === 'string' && x.trim() !== '';
  }

  // Read genres from either `genres: string[]` or `genre: string`
  function toGenres(s: Screening): string[] {
    // We only assert the *shape* we care about, without using `any`
    const maybe = s as unknown as { genres?: unknown; genre?: unknown };

    if (Array.isArray(maybe.genres)) {
      return (maybe.genres as unknown[])
        .filter(isNonEmptyString)
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (isNonEmptyString(maybe.genre)) {
      return maybe.genre
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    return [];
  }

  return (
    <table className="w-full bg-surface table-auto border-separate border-spacing-0 text-[14px] leading-6">
      <thead>
        <tr className="border-b border-border bg-highlight text-left">
          <th className="w-12 px-2 py-3" aria-label="expand column" />
          <th className="w-[12%] px-3 py-3 text-[14px] font-semibold uppercase tracking-wide text-muted">When</th>
          <th className="w-[33%] px-3 py-3 text-[14px] font-semibold uppercase tracking-wide text-muted">Title</th>
          <th className="w-[28%] px-3 py-3 text-[14px] font-semibold uppercase tracking-wide text-muted">Cinema</th>
          <th className="w-[20%] px-3 py-3 text-[14px] font-semibold uppercase tracking-wide text-muted text-center">Watchlist</th>
        </tr>
      </thead>

      <tbody>
        {items.map((s) => {
          const isOpen = open.has(s.id);
          const dt = new Date(s.start_at_utc);

          const dateStr = formatScreeningDate(dt);
          const timeStr = formatScreeningTime(dt);
          const startsFull = formatScreeningDateTime(dt);

          const year = s.year ? ` (${s.year})` : '';
          const genres = toGenres(s);

          return (
            <Fragment key={s.id}>
              {/* SUMMARY ROW */}
              <tr className="align-middle border-b border-border">
                {/* disclose */}
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-expanded={isOpen}
                    aria-controls={`row-details-${s.id}`}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface transition hover:bg-surface-subtle"
                    title={isOpen ? 'Hide details' : 'Show details'}
                  >
                    <svg
                      className={`h-3 w-3 transform transition ${isOpen ? 'rotate-90' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="8 4 16 12 8 20" />
                    </svg>
                  </button>
                </td>

                {/* when */}
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-0.5 leading-tight text-primary">
                    <div className="text-[14px] font-medium text-muted">{dateStr}</div>
                    <div className="text-[16px] font-semibold">{timeStr}</div>
                    {s.runtime_min != null && (
                      <div className="text-[13px] text-muted">{s.runtime_min} min</div>
                    )}
                  </div>
                </td>

                {/* title + meta + genre pills */}
                <td className="px-3 py-3">
                  <div className="text-[15px] font-semibold leading-6 text-primary">
                    { s.film_id ? (
                      <Link
                        href={`/films/${s.film_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        aria-label={`View details for ${s.title} in a new tab`}
                      >
                        {s.title}{year}
                      </Link>
                    ) : (
                      <>{s.title}{year}</>
                    )}
                  </div>

                  {s.directors && (
                    <div className="mt-0.5 text-[12px] text-muted">{s.directors}</div>
                  )}

                  {genres.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
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
                </td>

                {/* cinema */}
                <td className="px-3 py-3 text-primary">{s.cinema_name}</td>

                {/* watchlist action */}
                <td className="px-3 py-3 text-center align-middle">
                  <div className="inline-block min-w-[164px] mx-auto">
                    <WatchlistButton
                      screeningId={s.id}
                      initialSaved={savedIds?.has(s.id)}
                      onChange={(saved) => onSavedChange?.(s.id, saved)}
                      size="sm"
                    />
                  </div>
                </td>
              </tr>

              {/* DETAILS ROW — full-bleed cream strip (no inner rounded card) */}
              <tr id={`row-details-${s.id}`} className="border-b border-border">
                <td colSpan={5} className="p-0">
                  <div
                    className={[
                      'transition-[max-height,opacity] duration-200 ease-out',
                      isOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
                    ].join(' ')}
                  >
                    {isOpen && (
                      <div className="bg-band px-4 py-4 md:px-6">
                        <div className="grid gap-6 md:grid-cols-2 md:items-start">
                          {/* LEFT: schedule + blurb */}
                          <div className="grid gap-2 text-[13px]">
                            <div className="flex gap-3">
                              <span className="w-16 shrink-0 text-muted">Starts</span>
                              <span className="text-primary">{startsFull}</span>
                            </div>

                            {s.end_at_utc && (
                              <div className="flex gap-3">
                                <span className="w-16 shrink-0 text-muted">Ends</span>
                                <span className="text-primary">
                                  {formatScreeningDateTime(new Date(s.end_at_utc))}
                                </span>
                              </div>
                            )}

                            {s.runtime_min != null && (
                              <div className="flex gap-3">
                                <span className="w-16 shrink-0 text-muted">Runtime</span>
                                <span className="text-primary">{s.runtime_min} min</span>
                              </div>
                            )}

                            {s.description && (
                              <p className="mt-2 text-[13px] text-muted">{s.description}</p>
                            )}
                          </div>

                          {/* RIGHT: ratings + links */}
                          <div className="grid gap-3 md:justify-end">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* IMDb rating (handles string/number/empty) */}
                              {(() => {
                                const ratingStr = s.imdb_rating?.toString().trim() ?? '';
                                const hasRating = ratingStr !== '';
                                const ratingNum = Number(ratingStr);
                                return hasRating && !isNaN(ratingNum) ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary ring-1 ring-border">
                                    IMDb · {ratingNum.toFixed(1)}
                                    {s.imdb_votes ? (
                                      <span className="pl-0.5 text-muted">
                                        ({s.imdb_votes})
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null;
                              })()}

                              {typeof s.rt_rating_pct === 'number' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary ring-1 ring-border">
                                  Rotten Tomatoes · {s.rt_rating_pct}%
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {s.source_url && (
                                <a
                                  href={s.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-surface/80"
                                >
                                  View film on cinema site
                                </a>
                              )}
                              {s.imdb_url && (
                                <a
                                  href={s.imdb_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-surface/80"
                                >
                                  View film on IMDb
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}