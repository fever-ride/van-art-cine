'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import type { Screening } from '@/app/lib/screenings';
import {
  formatScreeningDate,
  formatScreeningTime,
  formatScreeningDateTime,
} from '@/app/lib/formatDate';
import { cleanDisplayText, formatPeopleLine } from '@/app/lib/displayText';
import { formatGenre } from '@/app/lib/formatGenre';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { RatedBadge, ImdbBadge, RtBadge } from '@/components/ui';

type Props = {
  readonly items: Screening[];
  readonly savedIds?: Set<number>;
  readonly onSavedChange?: (screeningId: number, saved: boolean) => void;
};

/*
 * One screening = one grid. The SAME markup lays out two ways:
 *   desktop (md+): a table-like row with aligned columns
 *                  when | title | cinema | watchlist | chevron
 *   mobile:        a card — time column on the left, everything else
 *                  stacked on the right.
 * Column widths live here once so the header and every row line up.
 */
const ROW_GRID =
  'grid gap-x-4 gap-y-1 ' +
  "grid-cols-[5.75rem_minmax(0,1fr)] [grid-template-areas:'when_main'_'when_cinema'_'when_actions'] " +
  "md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,9rem)_9rem_1.5rem] lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,13rem)_9rem_1.5rem] md:[grid-template-areas:'when_main_cinema_actions_chev'] md:items-center";

const COL_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted';

export default function ScreeningList({ items, savedIds, onSavedChange }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="bg-surface">
      {/* Column header — desktop only; mobile cards are self-explanatory. */}
      <div aria-hidden="true" className={`${ROW_GRID} hidden border-b border-rule px-4 py-3 md:grid`}>
        <span className={`${COL_LABEL} [grid-area:when]`}>When</span>
        <span className={`${COL_LABEL} [grid-area:main]`}>Film</span>
        <span className={`${COL_LABEL} [grid-area:cinema]`}>Cinema</span>
        <span className={`${COL_LABEL} [grid-area:actions] text-center`}>Watchlist</span>
      </div>

      <ul role="list" aria-label="Screenings">
        {items.map((s) => (
          <ScreeningItem
            key={s.id}
            s={s}
            isOpen={open.has(s.id)}
            onToggle={() => toggle(s.id)}
            saved={savedIds?.has(s.id)}
            onSavedChange={onSavedChange}
          />
        ))}
      </ul>
    </div>
  );
}

function ScreeningItem({
  s,
  isOpen,
  onToggle,
  saved,
  onSavedChange,
}: {
  s: Screening;
  isOpen: boolean;
  onToggle: () => void;
  saved?: boolean;
  onSavedChange?: (screeningId: number, saved: boolean) => void;
}) {
  const dt = new Date(s.start_at_utc);
  const dateStr = formatScreeningDate(dt);
  const timeStr = formatScreeningTime(dt);
  const year = s.year ? ` (${s.year})` : '';
  const genres = formatGenre(s.genre ?? (s as Screening & { genres?: string[] }).genres);
  const directors = formatPeopleLine(s.directors);
  const detailsId = `screening-details-${s.id}`;

  // The whole row toggles details, except clicks that land on its own
  // interactive children (title link, watchlist button, the toggle itself).
  const onRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a, button, input, label')) return;
    onToggle();
  };

  return (
    <li className="border-b border-border last:border-b-0">
      <div
        onClick={onRowClick}
        className={`${ROW_GRID} cursor-pointer px-4 py-4 transition-colors hover:bg-surface-hover ${
          isOpen ? 'bg-surface-hover' : ''
        }`}
      >
        {/* WHEN */}
        <div className="[grid-area:when] md:self-start">
          <div className="whitespace-nowrap font-display text-[17px] font-bold leading-tight text-primary md:text-[20px]">
            {timeStr}
          </div>
          <div className="mt-0.5 text-[13px] text-muted">{dateStr}</div>
          {s.runtime_min != null && (
            <div className="text-[13px] text-muted">{s.runtime_min} min</div>
          )}
        </div>

        {/* FILM: title (year), directors, genres */}
        <div className="min-w-0 [grid-area:main]">
          <div className="text-[16px] font-semibold leading-snug text-primary">
            {s.film_id ? (
              <Link
                href={`/films/${s.film_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
                aria-label={`View details for ${s.title} in a new tab`}
              >
                {s.title}
                {year}
              </Link>
            ) : (
              <>
                {s.title}
                {year}
              </>
            )}
          </div>
          {directors && <div className="mt-0.5 text-[13px] text-muted">{directors}</div>}
          {genres.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span
                  key={g}
                  className="rounded-control border border-border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CINEMA */}
        <div className="min-w-0 text-[14px] text-primary [grid-area:cinema] md:self-center">
          {s.cinema_name}
        </div>

        {/* ACTIONS: watchlist (+ mobile "Details" toggle) */}
        <div className="mt-2 flex items-center justify-between gap-3 [grid-area:actions] md:mt-0 md:justify-center">
          <WatchlistButton
            screeningId={s.id}
            initialSaved={saved}
            onChange={(next) => onSavedChange?.(s.id, next)}
            size="sm"
          />
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={detailsId}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-primary md:hidden"
          >
            Details
            <Chevron open={isOpen} />
          </button>
        </div>

        {/* CHEVRON — desktop toggle */}
        <div className="hidden justify-end [grid-area:chev] md:flex">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={detailsId}
            aria-label={isOpen ? `Hide details for ${s.title}` : `Show details for ${s.title}`}
            className="grid h-10 w-10 place-items-center rounded-control text-muted hover:text-primary"
          >
            <Chevron open={isOpen} />
          </button>
        </div>
      </div>

      {/* DETAILS — same content as before, only re-laid-out. */}
      <div id={detailsId} hidden={!isOpen}>
        {isOpen && <ScreeningDetails s={s} />}
      </div>
    </li>
  );
}

function ScreeningDetails({ s }: { s: Screening }) {
  const startsFull = formatScreeningDateTime(new Date(s.start_at_utc));
  const description = cleanDisplayText(s.description);

  return (
    <div className="border-t border-border bg-surface-subtle px-4 py-5 md:px-6">
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        {/* LEFT: schedule + blurb */}
        <div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className={COL_LABEL + ' self-center'}>Starts</dt>
            <dd className="text-primary">{startsFull}</dd>
            {s.end_at_utc && (
              <>
                <dt className={COL_LABEL + ' self-center'}>Ends</dt>
                <dd className="text-primary">{formatScreeningDateTime(new Date(s.end_at_utc))}</dd>
              </>
            )}
            {s.runtime_min != null && (
              <>
                <dt className={COL_LABEL + ' self-center'}>Runtime</dt>
                <dd className="text-primary">{s.runtime_min} min</dd>
              </>
            )}
          </dl>
          {description && (
            <p className="mt-4 text-sm leading-relaxed text-primary">{description}</p>
          )}
        </div>

        {/* RIGHT: ratings + links */}
        <div className="grid gap-3 md:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <ImdbBadge rating={s.imdb_rating} votes={s.imdb_votes} />
            <RtBadge pct={s.rt_rating_pct} />
            <RatedBadge rated={s.rated} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary: the ticket/showtime page for this screening. */}
            {s.source_url && (
              <a
                href={s.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-btn bg-accent px-4 text-[13px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
              >
                View on cinema site
              </a>
            )}
            {/* Secondary: background on the film itself. */}
            {s.imdb_url && (
              <a
                href={s.imdb_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-btn border border-primary bg-surface px-4 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-hover"
              >
                <span className="rounded-[3px] bg-imdb px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-black">
                  IMDb
                </span>
                Profile
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8 4 16 12 8 20" />
    </svg>
  );
}
