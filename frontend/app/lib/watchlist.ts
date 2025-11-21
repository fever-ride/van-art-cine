import { fetchWithAuth } from '@/app/lib/auth';

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

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json' };

/**
 * JSON fetch helper that:
 * - includes credentials
 * - uses fetchWithAuth (handles 401 -> refresh -> retry)
 * - surfaces backend {error,message} on failure
 */
async function fetchJSON<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithAuth(input, { credentials: 'include', ...init });

  // 204 No Content: return undefined for T=void use cases
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // ignore non-JSON bodies
  }

  if (!res.ok) {
    const body = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
    const message =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      `HTTP ${res.status}`;

    const err = new Error(message) as Error & {
      status?: number;
      response?: { status: number; body: unknown };
    };
    err.status = res.status;
    err.response = { status: res.status, body: data };
    throw err;
  }

  return data as T;
}

/** List saved screenings (auth; supports includePast/pagination). */
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

/** Add a screening. Returns whether a new row was created. */
export async function apiAddToWatchlist(
  screeningId: number
): Promise<{ ok: true; created: boolean }> {
  return fetchJSON<{ ok: true; created: boolean }>(`/api/watchlist`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ screeningId }),
  });
}

/** Remove a screening. Resolves on 204. */
export async function apiRemoveFromWatchlist(screeningId: number): Promise<void> {
  await fetchJSON<void>(`/api/watchlist/${encodeURIComponent(screeningId)}`, {
    method: 'DELETE',
  });
}

/** Check saved status for a screening. */
export async function apiWatchlistStatus(
  screeningId: number
): Promise<{ saved: boolean }> {
  const sp = new URLSearchParams({ screeningId: String(screeningId) });
  return fetchJSON<{ saved: boolean }>(`/api/watchlist/status?${sp.toString()}`);
}

/** Toggle saved state; returns new state. */
export async function apiToggleWatchlist(
  screeningId: number
): Promise<{ saved: boolean }> {
  return fetchJSON<{ saved: boolean }>('/api/watchlist/toggle', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ screeningId }),
  });
}

/* ---------------------------- Optional UI helpers --------------------------- */

/** Group items by film for table layouts. */
export function groupByFilm(items: WatchlistItem[]): Record<number, WatchlistItem[]> {
  return items.reduce<Record<number, WatchlistItem[]>>((acc, it) => {
    (acc[it.film_id] ||= []).push(it);
    return acc;
  }, {});
}

/** Format a UTC ISO string as local time with reasonable defaults. */
export function formatLocal(dtUtcISO: string, opts: Intl.DateTimeFormatOptions = {}) {
  const d = new Date(dtUtcISO);
  const base: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  return new Intl.DateTimeFormat(undefined, { ...base, ...opts }).format(d);
}

/** Import a batch of screeningIds into the authenticated user's watchlist. */
export async function apiImportWatchlist(
  screeningIds: number[]
): Promise<{ inserted: number; total: number }> {
  return fetchJSON<{ inserted: number; total: number }>(`/api/watchlist/import`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ screeningIds }),
  });
}