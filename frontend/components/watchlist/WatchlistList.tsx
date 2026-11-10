'use client';

import WatchlistButton from '@/components/watchlist/WatchlistButton';
import {
  ROW_ITEM,
  ROW_BODY,
  ListHeader,
  ScreeningWhen,
  FilmTitle,
} from '@/components/screenings/ScreeningRowParts';

export type WatchlistStatus = 'upcoming' | 'past' | 'unavailable';

export type WatchlistRow = {
  screening_id: number;
  start_at_utc: string | null;
  end_at_utc?: string | null;
  runtime_min?: number | null;
  tz?: string | null;

  film_id: number | null;
  title: string;
  year?: number | null;
  imdb_rating?: number | null;
  rt_rating_pct?: number | null;

  cinema_id: number | null;
  cinema_name: string | null;

  source_url?: string | null;

  status: WatchlistStatus;
};

/*
 * Same adaptive pattern as the homepage `ScreeningList` (one grid markup:
 * card below `md`, aligned columns from `md`), with the watchlist's own
 * columns: status and a ticket link, no expandable details.
 *
 * Mobile:  when | film
 *          when | cinema
 *          when | status
 *          actions (full width — tickets + remove need the room)
 *
 * The actions column has a fixed width, not `auto`: the header row has no
 * content there, so `auto` would size it differently from the data rows and
 * the header labels would drift off their columns.
 */
const ROW_GRID =
  'grid gap-x-4 gap-y-1 ' +
  "grid-cols-[5.75rem_minmax(0,1fr)] [grid-template-areas:'when_main'_'when_cinema'_'when_status'_'actions_actions'] " +
  // md (tablet): 4 columns, actions drop to a second line under the film.
  "md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,10rem)_6.5rem] md:[grid-template-areas:'when_main_cinema_status'_'when_actions_actions_actions'] md:items-center " +
  // lg+: everything on one line.
  "lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,13rem)_7rem_15rem] lg:[grid-template-areas:'when_main_cinema_status_actions']";

export default function WatchlistList({
  items,
  onSavedChange,
}: {
  items: WatchlistRow[];
  onSavedChange: (screeningId: number, saved: boolean) => void;
}) {
  return (
    <div className="bg-surface">
      <ListHeader
        grid={ROW_GRID}
        columns={[
          { area: 'when', label: 'When' },
          { area: 'main', label: 'Film' },
          { area: 'cinema', label: 'Cinema' },
          { area: 'status', label: 'Status' },
        ]}
      />
      <ul role="list" aria-label="Saved screenings">
        {items.map((r) => (
          <li key={r.screening_id} className={ROW_ITEM}>
            <div className={`${ROW_GRID} ${ROW_BODY}`}>
              <div className="[grid-area:when] md:self-start">
                <ScreeningWhen startUtc={r.start_at_utc} runtimeMin={r.runtime_min} />
              </div>

              <div className="min-w-0 [grid-area:main]">
                <FilmTitle filmId={r.film_id} title={r.title} year={r.year} />
                {typeof r.imdb_rating === 'number' && (
                  <div className="mt-0.5 text-meta text-muted">IMDb {r.imdb_rating.toFixed(1)}</div>
                )}
              </div>

              <div className="min-w-0 text-sm text-primary [grid-area:cinema]">
                {r.cinema_name ?? '—'}
              </div>

              <div className="mt-1 [grid-area:status] md:mt-0">
                <StatusBadge status={r.status} />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2 [grid-area:actions] md:mt-2 md:justify-start lg:mt-0 lg:justify-end">
                {r.source_url ? (
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center whitespace-nowrap rounded-btn border border-primary bg-surface px-4 text-meta font-semibold text-primary transition-colors hover:bg-surface-hover"
                  >
                    Get tickets
                  </a>
                ) : (
                  <span className="whitespace-nowrap text-xs text-muted">No ticket link</span>
                )}
                <WatchlistButton
                  screeningId={r.screening_id}
                  initialSaved={true}
                  onChange={(saved) => onSavedChange(r.screening_id, saved)}
                  size="sm"
                  confirmBeforeRemove
                  confirmMessage={`Remove "${r.title}" from your watchlist?`}
                  className="whitespace-nowrap"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_STYLE: Record<WatchlistStatus, string> = {
  upcoming: 'bg-success-bg text-success-text',
  past: 'bg-surface-subtle text-muted',
  unavailable: 'bg-warning-bg text-warning-text',
};
const STATUS_LABEL: Record<WatchlistStatus, string> = {
  upcoming: 'Upcoming',
  past: 'Past',
  unavailable: 'Unavailable',
};

function StatusBadge({ status }: { status: WatchlistStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-control px-2 py-0.5 text-label font-semibold uppercase tracking-wide ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
