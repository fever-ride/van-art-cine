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
  total: number;
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

export async function getScreenings(params: ScreeningsQuery = {}): Promise<ScreeningsResponse> {
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

  const res = await fetch(`/api/screenings?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<ScreeningsResponse>;
}