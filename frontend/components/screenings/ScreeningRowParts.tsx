import Link from 'next/link';
import { formatScreeningDate, formatScreeningTime } from '@/app/lib/formatDate';

/*
 * Building blocks shared by the adaptive screening lists — the homepage
 * Showtimes list (`ScreeningList`) and the watchlist (`WatchlistList`).
 * Each list owns its own grid columns; these pieces keep the cells looking
 * the same wherever a screening is shown.
 */

/** Small uppercase label used for detail terms (e.g. Language, Cast).
 * Lists have no column-header row — by decision, don't add one back. */
export const COL_LABEL = 'text-label font-semibold uppercase tracking-[0.08em] text-muted';

/** Outer frame of a list — same card as the homepage results. */
export const LIST_FRAME = 'overflow-hidden rounded-card border border-rule bg-surface';

/** One row/card: divider + hover, shared padding. */
export const ROW_ITEM = 'border-b border-border last:border-b-0';
export const ROW_BODY = 'px-4 py-4 transition-colors hover:bg-surface-hover';

/** Time (prominent) · date · runtime. Shows "—" when the start is unknown. */
export function ScreeningWhen({
  startUtc,
  runtimeMin,
}: {
  startUtc: string | null | undefined;
  runtimeMin?: number | null;
}) {
  if (!startUtc) return <div className="text-meta text-muted">—</div>;
  const dt = new Date(startUtc);
  return (
    <>
      <div className="whitespace-nowrap font-display text-time font-bold leading-tight text-primary md:text-xl">
        {formatScreeningTime(dt)}
      </div>
      <div className="mt-0.5 text-meta text-muted">{formatScreeningDate(dt)}</div>
      {runtimeMin != null && <div className="text-meta text-muted">{runtimeMin} min</div>}
    </>
  );
}

/** "Title (year)", linked to the film page when we know the film. */
export function FilmTitle({
  filmId,
  title,
  year,
  newTab = false,
}: {
  filmId?: number | null;
  title: string;
  year?: number | null;
  newTab?: boolean;
}) {
  const text = (
    <>
      {title}
      {year ? ` (${year})` : ''}
    </>
  );
  return (
    <div className="text-base font-semibold leading-snug text-primary">
      {filmId ? (
        <Link
          href={`/films/${filmId}`}
          className="underline-offset-2 hover:underline"
          {...(newTab
            ? {
                target: '_blank',
                // Internal link: keep the Referer (no `noreferrer`) so the
                // film page knows the visit came from this site and doesn't
                // show the outside-visitor intro (SiteIntroBar).
                rel: 'noopener',
                'aria-label': `View details for ${title} in a new tab`,
              }
            : {})}
        >
          {text}
        </Link>
      ) : (
        text
      )}
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
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

/**
 * "Get tickets ↗" — the external ticket/showtime link. Same 32px height and
 * 7.25rem width as WatchlistButton so the two sit as a matched pair (side by
 * side or stacked); a link (not a toggle),
 * so it's text + outbound arrow rather than a stateful button. Renders a
 * muted "No ticket link" when the screening has no URL.
 */
export function TicketLink({ href, className = '' }: { href?: string | null; className?: string }) {
  if (!href) {
    return (
      <span className={`inline-flex h-8 w-[7.25rem] items-center justify-center text-meta text-muted ${className}`}>
        No ticket link
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-8 w-[7.25rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-btn border border-primary bg-surface px-2.5 text-meta font-semibold text-primary transition-colors hover:bg-surface-hover ${className}`}
    >
      Get tickets <span aria-hidden="true">↗</span>
    </a>
  );
}
