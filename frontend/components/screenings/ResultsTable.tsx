'use client';

import Link from 'next/link';
import type { Screening } from '@/app/lib/screenings';
import WatchlistButton from '@/components/watchlist/WatchlistButton';

export default function ResultsTable({
  items,
  fmt,
  savedIds,
  onSavedChange,
}: {
  readonly items: Screening[];
  readonly fmt: Intl.DateTimeFormat;
  readonly savedIds?: Set<number>;
  readonly onSavedChange?: (screeningId: number, saved: boolean) => void;
}) {
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50 text-left">
          <th className="px-3 py-2 font-medium">When</th>
          <th className="px-3 py-2 font-medium">Title</th>
          <th className="px-3 py-2 font-medium">Cinema</th>
          <th className="px-3 py-2 text-right font-medium">IMDb</th>
          <th className="px-3 py-2 text-right font-medium">RT%</th>
          <th className="px-3 py-2 text-right font-medium">Runtime</th>
          <th className="px-3 py-2 text-right font-medium">Watchlist</th>
        </tr>
      </thead>
      <tbody>
        {items.map((s) => (
          <tr key={s.id} className="border-b border-gray-100">
            <td className="px-3 py-2">{fmt.format(new Date(s.start_at_utc))}</td>
            <td className="px-3 py-2">
              <div className="font-semibold">
                {s.film_id ? (
                  <Link
                    href={`/films/${s.film_id}`}
                    className="hover:underline"
                    aria-label={`View details for ${s.title}`}
                  >
                    {s.title} {s.year ? `(${s.year})` : ''}
                  </Link>
                ) : (
                  <>
                    {s.title} {s.year ? `(${s.year})` : ''}
                  </>
                )}
              </div>
              {s.directors && (
                <div className="text-xs text-gray-500">{s.directors}</div>
              )}
            </td>
            <td className="px-3 py-2">{s.cinema_name}</td>
            <td className="px-3 py-2 text-right">{s.imdb_rating ?? '–'}</td>
            <td className="px-3 py-2 text-right">{s.rt_rating_pct ?? '–'}</td>
            <td className="px-3 py-2 text-right">{s.runtime_min ?? '–'}</td>
            <td className="px-3 py-2 text-right">
              <WatchlistButton
                screeningId={s.id}
                initialSaved={savedIds?.has(s.id)}
                onChange={(saved) => onSavedChange?.(s.id, saved)}
                size="sm"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}