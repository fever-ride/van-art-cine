/**
 * Screenings API wrapper, types, and query builder.
 *
 * `getScreeningsServerSide` fetches paginated, filtered screening listings
 * for `frontend/app/page.tsx`. All datetime parameters are sent with a
 * Vancouver timezone so the backend returns times aligned to local
 * schedules.
 */
import { cache } from 'react';

// Plan: Add 'time' to SortKey to filter by time in a day
export type SortKey = 'time' | 'title' | 'imdb' | 'rt' | 'votes' | 'year';
export type Order = 'asc' | 'desc';

export interface Screening {
  id: number;
  title: string;
  start_at_utc: string;  // ISO string
  end_at_utc?: string | null;
  runtime_min?: number | null;
  tz?: string | null;

  cinema_id: number;
  cinema_name: string;

  film_id: number;
  imdb_id?: string | null;  // VARCHAR in DB
  tmdb_id?: number | null;
  year?: number | null;

  directors?: string | null;  // comma-separated for now
  description?: string | null;
  rated?: string | null;
  genre?: string | null;
  language?: string | null;
  country?: string | null;
  awards?: string | null;

  imdb_rating?: number | null;
  rt_rating_pct?: number | null;
  imdb_votes?: number | null;

  source_url?: string | null;
  imdb_url?: string | null;
}

export interface ScreeningsResponse {
  items: Screening[];
}

export interface ScreeningsQuery {
  date?: string;
  from?: string;
  to?: string;
  cinema_ids?: number[];
  film_id?: number;
  q?: string;
  sort?: SortKey;
  order?: Order;
  limit?: number;
  offset?: number;
  tz?: string;
}

export function buildSearchParams(params: ScreeningsQuery = {}): URLSearchParams {
  const sp = new URLSearchParams();

  // Iterate keys with proper typing
  (Object.keys(params) as (keyof ScreeningsQuery)[]).forEach((k) => {
    const v = params[k];

    if (v === undefined || v === null) return;

    if (k === 'cinema_ids' && Array.isArray(v)) {
      if (v.length > 0) sp.set('cinema_ids', v.join(','));
      return;
    }

    // Accept strings/numbers/booleans (others are handled above)
    const asString =
      typeof v === 'string' ? v :
      typeof v === 'number' ? String(v) :
      typeof v === 'boolean' ? String(v) :
      undefined;

    if (asString !== undefined && asString.trim() !== '') {
      sp.set(String(k), asString);
    }
  });

  return sp;
}

/**
 * Server side only. Fetches screenings directly from the backend with an
 * absolute URL. A relative URL (e.g. `/api/screenings`) only resolves
 * through next.config.ts's rewrite rule for a real incoming HTTP request;
 * it does not resolve for a fetch() call made from a Server Component
 * during rendering, which has no "current page" origin to fill in. See
 * docs/specs/homepage-ssr.md and docs/specs/url-driven-filters.md.
 *
 * Takes an already built query string, not a ScreeningsQuery object, so that
 * wrapping this in React's cache() dedupes correctly: cache() keys on
 * argument equality, and two calls with the same string are equal, while two
 * separately constructed ScreeningsQuery objects with identical fields would
 * not be. Build the string first with buildSearchParams(...).toString().
 *
 * The cache() wrapper means a page's generateMetadata and its body can both
 * request the same query without triggering a duplicate network request,
 * the same reasoning frontend/app/lib/films.ts's getFilmDetail uses.
 */
export const getScreeningsServerSide = cache(
  async (queryString: string): Promise<ScreeningsResponse> => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/screenings?${queryString}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as Promise<ScreeningsResponse>;
  }
);