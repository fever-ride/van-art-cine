'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { getGuestSet } from '@/app/lib/guestWatchlist';

type WatchlistRow = {
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

  // unified status we render against
  status: 'upcoming' | 'past' | 'inactive' | 'missing';
};

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null); // null until known
  const [includePast, setIncludePast] = useState(true);
  const [guestCount, setGuestCount] = useState<number>(0);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    []
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      // First, look at guest storage (used for banner + guest flow)
      const guestIds = Array.from(getGuestSet());
      setGuestCount(guestIds.length);

      try {
        // Try the signed-in flow first
        const res = await fetch('/api/watchlist', { credentials: 'include' });

        if (res.status === 401) {
          // Guest flow: hydrate IDs via bulk screenings endpoint
          setAuthed(false);

          if (guestIds.length === 0) {
            setItems([]);
            setLoading(false);
            return;
          }

          const bulkRes = await fetch('/api/screenings/bulk', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: guestIds }),
          });

          if (!bulkRes.ok) throw new Error(`HTTP ${bulkRes.status}`);
          const bulkData = await bulkRes.json(); // { items: [...] }

          const now = Date.now();
          const byId = new Map<number, any>(
            (bulkData.items ?? []).map((s: any) => [Number(s.id), s])
          );

          // Build rows ensuring every guest id appears (missing -> status 'missing')
          const rows: WatchlistRow[] = guestIds.map((id) => {
            const s = byId.get(id);
            if (!s) {
              return {
                screening_id: id,
                start_at_utc: null,
                film_id: null,
                title: '(no longer available)',
                cinema_id: null,
                cinema_name: null,
                status: 'missing',
              } as WatchlistRow;
            }
            const startMs = s.start_at_utc ? Date.parse(s.start_at_utc) : NaN;
            const past = Number.isFinite(startMs) && startMs < now;

            return {
              screening_id: Number(s.id),
              start_at_utc: s.start_at_utc ?? null,
              end_at_utc: s.end_at_utc ?? null,
              runtime_min: s.runtime_min ?? null,
              tz: s.tz ?? null,

              film_id: s.film_id ?? null,
              title: s.title ?? '(untitled)',
              year: s.year ?? null,
              imdb_rating: s.imdb_rating ?? null,
              rt_rating_pct: s.rt_rating_pct ?? null,

              cinema_id: s.cinema_id ?? null,
              cinema_name: s.cinema_name ?? null,

              source_url: s.source_url ?? null,

              // bulk endpoint won’t provide inactive/missing flags; compute basic status
              status: past ? 'past' : 'upcoming',
            };
          });

          setItems(rows);
          setLoading(false);
          return;
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json(); // { items: [...] } with status from backend
        setAuthed(true);
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load watchlist');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleSavedChange(screeningId: number, saved: boolean) {
    // If it was removed, prune from current table immediately
    if (!saved) {
      setItems((prev) => prev.filter((r) => r.screening_id !== screeningId));
    }
  }

  function StatusBadge({ status }: { status: WatchlistRow['status'] }) {
    const map: Record<WatchlistRow['status'], string> = {
      upcoming: 'text-green-700 bg-green-50 border-green-200',
      past: 'text-gray-700 bg-gray-50 border-gray-200',
      inactive: 'text-amber-800 bg-amber-50 border-amber-200',
      missing: 'text-red-700 bg-red-50 border-red-200',
    };
    const label: Record<WatchlistRow['status'], string> = {
      upcoming: 'Upcoming',
      past: 'Past',
      inactive: 'Inactive',
      missing: 'Missing',
    };
    return (
      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${map[status]}`}>
        {label[status]}
      </span>
    );
  }

  const rowsToShow = includePast ? items : items.filter((r) => r.status === 'upcoming');

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Watchlist</h1>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
          />
          Show past / inactive
        </label>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {err && <p className="text-sm text-red-600">Error: {err}</p>}

      {authed === false && !loading && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You’re not signed in. Your guest watchlist currently has{' '}
          <strong>{guestCount}</strong> item{guestCount === 1 ? '' : 's'} stored in this browser.
          <br />
          <Link href="/auth/login" className="text-blue-600 underline">
            Log in
          </Link>{' '}
          to sync and keep them across devices.
        </div>
      )}

      {!loading && rowsToShow.length === 0 && (
        <p className="text-sm text-gray-600">Your watchlist is empty.</p>
      )}

      {!loading && rowsToShow.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Cinema</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rowsToShow.map((r) => (
                <tr key={r.screening_id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    {r.start_at_utc ? fmt.format(new Date(r.start_at_utc)) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">
                      {r.film_id ? (
                        <Link href={`/films/${r.film_id}`} className="hover:underline">
                          {r.title} {r.year ? `(${r.year})` : ''}
                        </Link>
                      ) : (
                        <>
                          {r.title} {r.year ? `(${r.year})` : ''}
                        </>
                      )}
                    </div>
                    {typeof r.imdb_rating === 'number' && (
                      <div className="text-xs text-gray-500">IMDb {r.imdb_rating.toFixed(1)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.cinema_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <WatchlistButton
                      screeningId={r.screening_id}
                      initialSaved={true}
                      onChange={(saved) => handleSavedChange(r.screening_id, saved)}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}