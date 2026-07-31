/**
 * Film API wrapper and types.
 *
 * `getFilmDetail` is wrapped with React.cache() so that `generateMetadata`
 * and the page component can both call it without triggering duplicate network
 * requests — the result is shared within a single server request lifecycle.
 */
export interface FilmDetailResponse {
  film: Film;
  upcoming: UpcomingScreening[];
}

export interface Film {
  id: number;
  title: string;
  year: number | null;
  description: string | null;
  rated: string | null;
  genre: string | null;
  language: string | null;
  country: string | null;
  awards: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  imdb_url: string | null;
  imdb_rating: string | null;
  rt_rating_pct: number | null;
  imdb_votes: number | null;
  directors: string[];
  writers: string[];
  cast: string[];
  poster_url?: string | null; 
}

// Each upcoming screening for this film
export interface UpcomingScreening {
  id: number;
  title: string;
  start_at_utc: string;
  end_at_utc?: string | null;
  runtime_min?: number | null;
  cinema_id: number;
  cinema_name: string;
  cinema_website?: string | null;
  source_url?: string | null;
}

import { cache } from 'react';

export const getFilmDetail = cache(async (film_id: number): Promise<FilmDetailResponse> => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/films/${film_id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<FilmDetailResponse>;
});
