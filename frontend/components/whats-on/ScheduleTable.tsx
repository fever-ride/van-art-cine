'use client';

import { useWatchlist } from '@/lib/hooks/useWatchlist';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { formatScreeningDate, formatScreeningTime, todayYmdInDisplayTimezone } from '@/lib/formatDate';

export interface ScheduleRow {
  screeningId: number;
  filmTitle: string;
  startAtUtc: string;
  cinemaName: string;
}

/** The full, chronological list of every showtime on a retrospective/spotlight
 * page, past and future mixed together — a past row shows "Already screened"
 * instead of a watchlist button, and today's/tomorrow's rows get a small
 * badge so a reader can tell at a glance what's actually still catchable. */
export default function ScheduleTable({ rows }: { rows: ScheduleRow[] }) {
  const { savedIds, handleSavedChange } = useWatchlist();

  const now = new Date();
  const todayYmd = todayYmdInDisplayTimezone(now);
  const tomorrowYmd = todayYmdInDisplayTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b-2 border-primary text-xs uppercase tracking-wide text-muted">
            <th className="px-2.5 py-2 font-bold">Date</th>
            <th className="px-2.5 py-2 font-bold">Film</th>
            <th className="px-2.5 py-2 font-bold">Time</th>
            <th className="px-2.5 py-2 font-bold">Cinema</th>
            <th className="px-2.5 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const start = new Date(row.startAtUtc);
            const isPast = start.getTime() < now.getTime();
            const rowYmd = todayYmdInDisplayTimezone(start);
            const soonLabel = isPast
              ? null
              : rowYmd === todayYmd
                ? 'Today'
                : rowYmd === tomorrowYmd
                  ? 'Tomorrow'
                  : null;

            return (
              <tr
                key={row.screeningId}
                className={`border-b border-border transition-colors hover:bg-surface-subtle ${isPast ? 'text-muted' : ''}`}
              >
                <td className="whitespace-nowrap px-2.5 py-2.5">
                  {formatScreeningDate(start)}
                  {soonLabel && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase text-accent-ink">
                      {soonLabel}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5 font-semibold text-primary">
                  {row.filmTitle}
                </td>
                <td className="whitespace-nowrap px-2.5 py-2.5">{formatScreeningTime(start)}</td>
                <td className="whitespace-nowrap px-2.5 py-2.5 text-muted">{row.cinemaName}</td>
                <td className="px-2.5 py-2.5">
                  {isPast ? (
                    <span className="text-xs text-muted">Already screened</span>
                  ) : (
                    <WatchlistButton
                      screeningId={row.screeningId}
                      initialSaved={savedIds.has(row.screeningId)}
                      onChange={(saved) => handleSavedChange(row.screeningId, saved)}
                      size="sm"
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
