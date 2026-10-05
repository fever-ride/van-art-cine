import { buildPosterUrl } from '../utils/posterUrl.js';

/**
 * Shared Prisma `select` + flattening for a `screening` row, denormalized
 * to the public API's flat shape (film and cinema fields promoted to the
 * top level, directors joined to a single string). Used by both
 * `fetchScreenings` (backend/src/models/screenings.js) and
 * `getRelatedFilms` (backend/src/models/films.js) so the two don't drift
 * into two slightly different "Screening" shapes on the frontend.
 */
export const SCREENING_SELECT = {
  id: true,
  start_at_utc: true,
  end_at_utc: true,
  runtime_min: true,
  tz: true,
  source_url: true,
  film: {
    select: {
      id: true,
      title: true,
      imdb_id: true,
      tmdb_id: true,
      year: true,
      description: true,
      rated: true,
      genre: true,
      language: true,
      country: true,
      awards: true,
      imdb_rating: true,
      rt_rating_pct: true,
      imdb_votes: true,
      imdb_url: true,
      poster_path: true,
      film_person: {
        where: { role: 'director' },
        select: { person: { select: { name: true } } },
      },
    },
  },
  cinema: { select: { id: true, name: true } },
};

export function flattenScreeningRow(s) {
  const film = s.film ?? {};
  const cinema = s.cinema ?? {};
  const directors =
    (film.film_person ?? [])
      .map((fp) => fp.person?.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join(', ') || null;

  return {
    id: s.id,
    title: film.title ?? null,
    start_at_utc: s.start_at_utc,
    end_at_utc: s.end_at_utc,
    runtime_min: s.runtime_min,
    tz: s.tz,
    cinema_id: cinema.id ?? null,
    cinema_name: cinema.name ?? null,
    film_id: film.id ?? null,
    imdb_id: film.imdb_id ?? null,
    tmdb_id: film.tmdb_id ?? null,
    year: film.year ?? null,
    directors,
    description: film.description ?? null,
    rated: film.rated ?? null,
    genre: film.genre ?? null,
    language: film.language ?? null,
    country: film.country ?? null,
    awards: film.awards ?? null,
    imdb_rating: film.imdb_rating ?? null,
    rt_rating_pct: film.rt_rating_pct ?? null,
    imdb_votes: film.imdb_votes ?? null,
    source_url: s.source_url ?? null,
    imdb_url: film.imdb_url ?? null,
    poster_url: buildPosterUrl(film.poster_path),
  };
}
