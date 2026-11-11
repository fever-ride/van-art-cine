'use client';

import { useMemo, useState } from 'react';
import type { UpcomingScreening } from '@/app/lib/films';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import {
  LIST_FRAME,
  ROW_BODY,
  ROW_ITEM,
  ScreeningWhen,
  TicketLink,
} from '@/components/screenings/ScreeningRowParts';

type Props = {
  upcoming: UpcomingScreening[];
  /** Kept for API compatibility; the heading is film-agnostic. */
  filmTitle?: string;
};

/** Rows shown before "Show all". */
export const INITIAL_ROWS = 8;

/*
 * Same row as the homepage Showtimes list (ScreeningList): big display-font
 * time with the date under it, then the cinema, then the actions; divided
 * rows inside the ruled card. No column header, no runtime (by request).
 *
 * Phone:  when | cinema
 *         actions (full width, side by side)
 * sm+:    when | cinema | actions
 */
const ROW_GRID =
  'grid gap-x-4 gap-y-2 ' +
  "grid-cols-[5.75rem_minmax(0,1fr)] [grid-template-areas:'when_cinema'_'actions_actions'] " +
  "sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:[grid-template-areas:'when_cinema_actions'] sm:items-center";

/**
 * Upcoming screenings on the film detail page: soonest first, folded after
 * INITIAL_ROWS with Show all / Show fewer, and filterable
 * by cinema when the film plays at more than one. All data is already on the
 * page (`upcoming`, up to 200 rows from /api/films/:id), so filtering is
 * client-side — no extra API.
 */
export default function FilmShowtimes({ upcoming }: Props) {
  const { savedIds, handleSavedChange } = useWatchlist();
  const [cinemaId, setCinemaId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () =>
      [...upcoming].sort(
        (a, b) => new Date(a.start_at_utc).getTime() - new Date(b.start_at_utc).getTime(),
      ),
    [upcoming],
  );

  const cinemas = useMemo(() => {
    const seen = new Map<number, string>();
    for (const s of sorted) if (!seen.has(s.cinema_id)) seen.set(s.cinema_id, s.cinema_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [sorted]);

  const filtered = cinemaId == null ? sorted : sorted.filter((s) => s.cinema_id === cinemaId);
  const shown = showAll ? filtered : filtered.slice(0, INITIAL_ROWS);
  const canFold = filtered.length > INITIAL_ROWS;

  const summary = `${sorted.length} screening${sorted.length === 1 ? '' : 's'} · ${cinemas.length} cinema${
    cinemas.length === 1 ? '' : 's'
  }`;

  return (
    <section aria-labelledby="showtimes-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2
            id="showtimes-heading"
            className="font-display text-xl font-bold uppercase text-primary md:text-2xl"
          >
            Upcoming screenings in Vancouver
          </h2>
          {sorted.length > 0 && <p className="mt-0.5 text-meta text-muted">{summary}</p>}
        </div>

        {cinemas.length > 1 && (
          <CinemaFilter
            cinemas={cinemas}
            value={cinemaId}
            onChange={(id) => {
              setCinemaId(id);
              setShowAll(false);
            }}
          />
        )}
      </div>

      {sorted.length === 0 ? (
        <div className={`${LIST_FRAME} px-4 py-6 text-sm text-muted`}>No upcoming screenings.</div>
      ) : (
        <div className={LIST_FRAME}>
          <ul role="list">
            {shown.map((s) => (
              <ShowtimeRow
                key={s.id}
                s={s}
                saved={savedIds.has(s.id)}
                onSavedChange={(saved) => handleSavedChange(s.id, saved)}
              />
            ))}
          </ul>

          {canFold && (
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="min-h-10 rounded-btn border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover"
              >
                {showAll ? 'Show fewer' : `Show all ${filtered.length} screenings`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Quiet text filter — a secondary control, so no boxes or fills: muted
 * names, the active one in ink with the same apricot underline as the
 * homepage Movies/Showtimes tabs. */
function CinemaFilter({
  cinemas,
  value,
  onChange,
}: {
  cinemas: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <div role="group" aria-label="Filter by cinema" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-meta">
      <span className="text-muted">Cinema:</span>
      {[{ id: null as number | null, name: 'All' }, ...cinemas].map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id ?? 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.id)}
            className={`border-b-2 py-1 transition-colors ${
              active
                ? 'border-accent font-semibold text-primary'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

function ShowtimeRow({
  s,
  saved,
  onSavedChange,
}: {
  s: UpcomingScreening;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  return (
    <li className={ROW_ITEM}>
      <div className={`${ROW_GRID} ${ROW_BODY}`}>
        <div className="[grid-area:when] sm:self-start">
          <ScreeningWhen startUtc={s.start_at_utc} />
        </div>
        <div className="min-w-0 text-sm text-primary [grid-area:cinema] sm:self-center">
          {s.cinema_name}
        </div>
        <div className="flex flex-wrap items-center gap-2 [grid-area:actions]">
          <TicketLink href={s.source_url} />
          <WatchlistButton
            screeningId={s.id}
            initialSaved={saved}
            onChange={onSavedChange}
            size="sm"
          />
        </div>
      </div>
    </li>
  );
}
