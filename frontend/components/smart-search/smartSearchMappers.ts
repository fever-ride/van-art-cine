import type { Screening } from '@/app/lib/screenings';
import type { SmartSearchScreeningResult } from '@/app/lib/smartSearch';

export function toScreeningItem(item: SmartSearchScreeningResult): Screening {
  return {
    id: item.id,
    title: item.title,
    start_at_utc: item.start_at_utc,
    end_at_utc: item.end_at_utc,
    runtime_min: item.runtime_min,
    tz: item.tz,
    cinema_id: item.cinema_id,
    cinema_name: item.cinema_name,
    film_id: item.film_id,
    imdb_id: item.imdb_id,
    tmdb_id: item.tmdb_id,
    year: item.year,
    directors: item.directors,
    description: item.description,
    rated: item.rated,
    genre: item.genre,
    language: item.language,
    country: item.country,
    awards: item.awards,
    imdb_rating: item.imdb_rating,
    rt_rating_pct: item.rt_rating_pct,
    imdb_votes: item.imdb_votes,
    source_url: item.source_url,
    imdb_url: item.imdb_url,
  };
}
