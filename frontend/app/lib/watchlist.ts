export type WatchStatus = 'upcoming' | 'past' | 'inactive' | 'missing';

export interface WatchlistItem {
  screening_id: number;

  // screening
  start_at_utc: string;
  end_at_utc: string | null;
  runtime_min: number | null;

  // film
  film_id: number;
  title: string;
  year: number | null;

  // cinema
  cinema_id: number;
  cinema_name: string;

  // links
  source_url: string | null;

  // status
  status: WatchStatus;
}

export interface WatchlistListResponse {
  items: WatchlistItem[];
}

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
};

// JSON fetch helper that propagates backend error messages
async function fetchJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include', // send/receive cookies
    ...init,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // e.g., 204 No Content
  }

  if (!res.ok) {
    const body = typeof data === 'object' && data !== null 
      ? data as Record<string, unknown> 
      : {};
    const msg =
      (body.error as string) ||
      (body.message as string) ||
      `HTTP ${res.status}`;

    const err = new Error(msg) as Error & {
      status?: number;
      response?: { status: number; body: unknown };
    };

    err.status = res.status;
    err.response = { status: res.status, body: data };
    throw err;
  }

  return data as T;
}

/** List all saved screenings for current user (auth required). */
// API: now supports includePast
export async function apiListWatchlist(opts?: {
  limit?: number;
  offset?: number;
  includePast?: boolean;
}): Promise<WatchlistListResponse> {
  const sp = new URLSearchParams();
  if (opts?.limit != null) sp.set('limit', String(opts.limit));
  if (opts?.offset != null) sp.set('offset', String(opts.offset));
  if (opts?.includePast !== undefined) sp.set('includePast', String(opts.includePast));
  const qs = sp.toString();
  return fetchJSON<WatchlistListResponse>(`/api/watchlist${qs ? `?${qs}` : ''}`);
}

/** Add screening to watchlist. Returns whether a new row was created. */
export async function apiAddToWatchlist(screeningId: number): Promise<{ ok: true; created: boolean }> {
  return fetchJSON<{ ok: true; created: boolean }>(`/api/watchlist`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ screeningId }),
  });
}

/** Remove screening from watchlist. No body on success. */
export async function apiRemoveFromWatchlist(screeningId: number): Promise<void> {
  // backend returns 204 No Content
  await fetchJSON<void>(`/api/watchlist/${encodeURIComponent(screeningId)}`, { method: 'DELETE' });
}

/** Is this screening already saved? (handy to render button state) */
export async function apiWatchlistStatus(screeningId: number): Promise<{ saved: boolean }> {
  const sp = new URLSearchParams({ screeningId: String(screeningId) });
  return fetchJSON<{ saved: boolean }>(`/api/watchlist/status?${sp.toString()}`);
}

/** Toggle helper: adds if not saved, removes if saved. Returns new saved state. */
export async function apiToggleWatchlist(
  screeningId: number
): Promise<{ saved: boolean }> {
  return fetchJSON<{ saved: boolean }>('/api/watchlist/toggle', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ screeningId }),
  });
}

/* ---------- Optional UI helpers ---------- */

/** Group items by film for the watchlist page layout. */
export function groupByFilm(items: WatchlistItem[]): Record<number, WatchlistItem[]> {
  return items.reduce<Record<number, WatchlistItem[]>>((acc, it) => {
    (acc[it.film_id] ||= []).push(it);
    return acc;
  }, {});
}

/** Format a UTC datetime string into a local, readable short label. */
export function formatLocal(dtUtcISO: string, opts: Intl.DateTimeFormatOptions = {}) {
  const d = new Date(dtUtcISO);
  // reasonable default
  const base: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  return new Intl.DateTimeFormat(undefined, { ...base, ...opts }).format(d);
}

/** Import a batch of screeningIds into the authenticated user's watchlist */
export async function apiImportWatchlist(screeningIds: number[]): Promise<{ inserted: number; total: number }> {
  return fetchJSON<{ inserted: number; total: number }>(`/api/watchlist/import`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ screeningIds }),
  });
}