'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Noto_Sans } from 'next/font/google';
import { apiListWatchlist } from '@/app/lib/watchlist';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { getGuestSet } from '@/app/lib/guestWatchlist';

// Global font for this page
const noto = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
});

// Narrow unknown errors to something with a message
function isErrorLike(x: unknown): x is { message: string } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'message' in x &&
    typeof (x as Record<string, unknown>).message === 'string'
  );
}

// Shape of the /api/screenings/bulk response items (only fields we use)
type BulkScreening = {
  id: number | string;
  start_at_utc?: string | null;
  end_at_utc?: string | null;
  runtime_min?: number | null;
  tz?: string | null;

  film_id?: number | null;
  title?: string | null;
  year?: number | null;
  imdb_rating?: number | null;
  rt_rating_pct?: number | null;

  cinema_id?: number | null;
  cinema_name?: string | null;

  source_url?: string | null;
};

type BulkResponse = {
  items?: BulkScreening[];
};

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

  status: 'upcoming' | 'past' | 'inactive' | 'missing';
};

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [includePast, setIncludePast] = useState(true);

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

      const guestIds = Array.from(getGuestSet());

      try {
        // First, try to load the authenticated watchlist.
        // This goes through fetchWithAuth and will attempt a token refresh on 401.
        const data = await apiListWatchlist({ limit: 100 });
        setAuthed(true);
        setItems(Array.isArray(data.items) ? data.items : []);
        return;
      } catch (e: unknown) {
        const errAny = e as { status?: number } | undefined;

        // If it is not a 401, treat it as a real error and handle it here.
        if (!errAny || errAny.status !== 401) {
          const msg = isErrorLike(e) ? e.message : 'Unknown error';
          setErr(msg);
          setLoading(false);
          return;
        }

        // 401 means the user is effectively a guest (no valid session).
        setAuthed(false);

        if (guestIds.length === 0) {
          setItems([]);
          setLoading(false);
          return;
        }

        // Guest fallback: look up screenings via the bulk endpoint.
        const bulkRes = await fetch('/api/screenings/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: guestIds }),
        });

        if (!bulkRes.ok) {
          const msg = `HTTP ${bulkRes.status}`;
          setErr(msg);
          setLoading(false);
          return;
        }

        const bulkData: BulkResponse = await bulkRes.json();

        const now = Date.now();
        const byId = new Map<number, BulkScreening>(
          (bulkData.items ?? []).map((s: BulkScreening) => [Number(s.id), s])
        );

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

            status: past ? 'past' : 'upcoming',
          };
        });

        setItems(rows);
        setLoading(false);
        return;
      } finally {
        // Just in case we hit an unexpected path.
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleSavedChange(screeningId: number, saved: boolean) {
    if (!saved) {
      setItems((prev) => prev.filter((r) => r.screening_id !== screeningId));
    }
  }

  function StatusBadge({ status }: { status: WatchlistRow['status'] }) {
    const map: Record<WatchlistRow['status'], string> = {
      upcoming: 'bg-green-50 text-green-700',
      past: 'bg-gray-100 text-gray-700',
      inactive: 'bg-amber-50 text-amber-800',
      missing: 'bg-red-50 text-red-700',
    };
    const label: Record<WatchlistRow['status'], string> = {
      upcoming: 'Upcoming',
      past: 'Past',
      inactive: 'Inactive',
      missing: 'Missing',
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] leading-5 font-semibold ${map[status]}`}
      >
        {label[status]}
      </span>
    );
  }

  const rowsToShow = includePast ? items : items.filter((r) => r.status === 'upcoming');

  return (
    <main className={`${noto.className} mx-auto max-w-7xl px-4 py-8`}>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-gray-900">
          My Watchlist
        </h1>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
          />
          Show past / inactive
        </label>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {err && <p className="text-sm text-red-600">Error: {err}</p>}

      {authed === false && !loading && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You’re browsing as a guest.
          <br />
          <Link href="/auth/login" className="font-semibold text-[#4A7A93] underline">
            Log in
          </Link>{' '}
          to save your watchlist and access it anytime, on any device!
        </div>
      )}

      {!loading && rowsToShow.length === 0 && (
        <p className="text-sm text-gray-600">Your watchlist is empty.</p>
      )}

      {!loading && rowsToShow.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
          {/* Header band above the list */}
          <div className="border-b border-border bg-highlight px-4 py-3 md:px-6">
            <h2 className="text-sm font-semibold text-primary md:text-[15px]">
              Saved Screenings
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[14px]">
              <tbody>
                {rowsToShow.map((r) => (
                  <tr
                    key={r.screening_id}
                    className="border-t border-border/70 bg-surface transition-colors hover:bg-[#FFF8E7]"
                  >
                    {/* WHEN — compact 3-line stack */}
                    <td className="px-4 py-3 align-middle">
                      {r.start_at_utc ? (
                        <div className="leading-5">
                          <div className="text-[13px] text-gray-700">
                            {new Intl.DateTimeFormat(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            }).format(new Date(r.start_at_utc))}
                          </div>
                          <div className="text-[15px] font-semibold text-gray-900">
                            {new Intl.DateTimeFormat(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            }).format(new Date(r.start_at_utc))}
                          </div>
                          {typeof r.runtime_min === 'number' && (
                            <div className="text-[12px] text-gray-500">
                              {r.runtime_min} min
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* TITLE */}
                    <td className="px-4 py-3 align-middle">
                      <div className="text-[15px] font-semibold text-gray-900">
                        {r.film_id ? (
                          <Link
                            href={`/films/${r.film_id}`}
                            className="hover:underline"
                          >
                            {r.title} {r.year ? `(${r.year})` : ''}
                          </Link>
                        ) : (
                          <>
                            {r.title} {r.year ? `(${r.year})` : ''}
                          </>
                        )}
                      </div>
                      {typeof r.imdb_rating === 'number' && (
                        <div className="mt-0.5 text-[12px] text-gray-500">
                          IMDb {r.imdb_rating.toFixed(1)}
                        </div>
                      )}
                    </td>

                    {/* CINEMA */}
                    <td className="px-4 py-3 align-middle text-[14px] text-gray-900">
                      {r.cinema_name ?? '—'}
                    </td>

                    {/* STATUS */}
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge status={r.status} />
                    </td>

                    {/* ACTION: ticket link + watchlist button, vertically centered */}
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-3">
                        {r.source_url ? (
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full border border-border bg-highlight px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-highlight/80"
                          >
                            Get tickets on cinema site!
                          </a>
                        ) : (
                          <span className="text-xs text-muted">
                            No ticket link
                          </span>
                        )}

                        <WatchlistButton
                          screeningId={r.screening_id}
                          initialSaved={true}
                          onChange={(saved) =>
                            handleSavedChange(r.screening_id, saved)
                          }
                          size="sm"
                          confirmBeforeRemove
                          confirmMessage={`Remove "${r.title}" from your watchlist?`}
                          className="whitespace-nowrap"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}