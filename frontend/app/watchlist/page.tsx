'use client';

import { useEffect, useState } from 'react';
import { apiListWatchlist } from '@/app/lib/watchlist';
import { getGuestSet } from '@/app/lib/guestWatchlist';
import { isErrorLike } from '@/app/lib/typeGuards';
import WatchlistList, { type WatchlistRow } from '@/components/watchlist/WatchlistList';
import { LIST_FRAME } from '@/components/screenings/ScreeningRowParts';

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

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [includePast, setIncludePast] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const guestIds = Array.from(getGuestSet());

      try {
        const data = await apiListWatchlist({ limit: 100 });
        setAuthed(true);
        const raw = Array.isArray(data.items) ? data.items : [];
        setItems(raw.map((r) => {
          const s = r.status as string;
          const status: WatchlistRow['status'] =
            s === 'inactive' || s === 'missing' ? 'unavailable' : s as WatchlistRow['status'];
          return { ...r, status };
        }));
        return;
      } catch (e: unknown) {
        const errAny = e as { status?: number } | undefined;

        if (!errAny || errAny.status !== 401) {
          const msg = isErrorLike(e) ? e.message : 'Unknown error';
          setErr(msg);
          setLoading(false);
          return;
        }

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
              status: 'unavailable',
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

  const rowsToShow = includePast ? items : items.filter((r) => r.status === 'upcoming');

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 md:py-10">
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[clamp(28px,4vw,40px)] font-bold uppercase leading-none tracking-[-0.02em] text-primary">
            My Watchlist
          </h1>
          {!loading && items.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              {rowsToShow.length} saved screening{rowsToShow.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted lg:min-h-9">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-control border border-border accent-[var(--accent-strong)]"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
          />
          Show past &amp; unavailable
        </label>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {err && <p className="text-sm text-error-text">Error: {err}</p>}

      {authed === false && !loading && (
        <div className="mb-4 rounded-card border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
          You’re browsing as a guest. Sign in to save your watchlist and access it anytime, on any device.
        </div>
      )}

      {!loading && rowsToShow.length === 0 && (
        <p className="text-sm text-muted">Your watchlist is empty.</p>
      )}

      {!loading && rowsToShow.length > 0 && (
        <div className={LIST_FRAME}>
          <WatchlistList items={rowsToShow} onSavedChange={handleSavedChange} />
        </div>
      )}
    </main>
  );
}
