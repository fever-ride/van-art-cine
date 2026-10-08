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
  poster_url?: string | null;
}

export interface ScreeningsResponse {
  items: Screening[];
  /** Count of all rows matching the current filters, ignoring limit/offset —
   * for computing total page count, not just this page's items.length. */
  total: number;
}

export interface ScreeningsQuery {
  date?: string;
  from?: string;
  to?: string;
  cinema_ids?: number[];
  film_id?: number;
  q?: string;
  genre?: string[];
  language?: string[];
  sort?: SortKey;
  order?: Order;
  limit?: number;
  offset?: number;
  tz?: string;
}

export interface FilmShowtime {
  screening_id: number;
  start_at_utc: string;
  cinema_id: number;
  cinema_name: string;
  source_url: string | null;
}

/** One entry per film from `GET /api/films` — the Film view's data source,
 * paginated by distinct film count so a film's showtimes never split across
 * page boundaries the way row-based `/api/screenings` pagination could.
 * Field names mirror `Screening`'s own snake_case wire shape rather than
 * introducing a second camelCase convention for the same data. */
export interface FilmListItem {
  film_id: number;
  title: string;
  directors: string | null;
  poster_url: string | null;
  genre: string | null;
  country: string | null;
  language: string | null;
  year: number | null;
  description: string | null;
  imdb_rating: number | null;
  rt_rating_pct: number | null;
  imdb_votes: number | null;
  imdb_url: string | null;
  runtime_min: number | null;
  showtimes: FilmShowtime[];
}

export interface FilmsResponse {
  items: FilmListItem[];
  /** Count of distinct films matching the current filters, ignoring
   * limit/offset — unlike `ScreeningsResponse.total`, this is a film count,
   * not a screening-row count. */
  total: number;
}

export interface ScreeningFacetValue {
  name: string;
  count: number;
}

export interface ScreeningFacets {
  cinemas: Array<{ id: number; name: string; count: number }>;
  genres: ScreeningFacetValue[];
  languages: ScreeningFacetValue[];
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

    if ((k === 'genre' || k === 'language') && Array.isArray(v)) {
      if (v.length > 0) sp.set(k, v.join(','));
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

/**
 * Server side only — same reasoning as `getScreeningsServerSide` (absolute
 * URL, `cache()`-wrapped on the already-built query string). Powers Film
 * view in `frontend/app/page.tsx`: the query is built the same way as the
 * Table view's (`buildScreeningsQuery`) since both are filtering the exact
 * same underlying screenings, just paginated and shaped differently — see
 * `fetchFilms` on the backend for why that shared filter logic lives in one
 * place rather than two.
 */
export const getFilmsServerSide = cache(
  async (queryString: string): Promise<FilmsResponse> => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/films?${queryString}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as Promise<FilmsResponse>;
  }
);

/** Facet counts (cinema/genre/language) for the filter panel, computed over
 * the full active+upcoming catalog — see `getScreeningFacets` on the
 * backend for why this isn't recomputed per the caller's current
 * selection. Revalidated hourly like the sitemap's own screenings fetch;
 * these counts don't need to be second-to-second fresh. */
export const getScreeningFacets = cache(async (): Promise<ScreeningFacets> => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/screenings/facets`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<ScreeningFacets>;
});

/** Client side fetch, same reasoning/fallback as `apiListCinemas`
 * (`frontend/app/lib/cinemas.ts`): a relative URL works here since this
 * runs from the browser, not during server rendering. */
export async function apiScreeningFacets(): Promise<ScreeningFacets> {
  const res = await fetch('/api/screenings/facets', { credentials: 'include' });
  if (!res.ok) return { cinemas: [], genres: [], languages: [] };
  return res.json() as Promise<ScreeningFacets>;
}