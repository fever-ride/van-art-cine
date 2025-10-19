// Plan: Add 'time' to SortKey to filter by time in a day
export type SortKey = 'date' | 'title' | 'imdb' | 'rt' | 'votes' | 'year';
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
  cinema_id?: number;
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
  (Object.entries(params) as [keyof ScreeningsQuery, any][])
    .forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') sp.set(String(k), String(v));
    });

  const res = await fetch(`/api/screenings?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<ScreeningsResponse>;
}