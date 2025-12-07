import { prisma } from '../lib/prismaClient.js';

function buildPosterUrl(posterPath) {
  if (!posterPath) return null;

  // maybe move these to env
  const base = 'https://image.tmdb.org/t/p/';
  const size = 'w342'; // medium size

  return `${base}${size}${posterPath}`;
}

/**
 * Get a single film by ID.
 * Returns the film row plus a derived poster_url, or null if not found.
 */
export async function getFilmById(id) {
  const row = await prisma.film.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      title: true,
      year: true,
      description: true,
      rated: true,
      genre: true,
      language: true,
      country: true,
      awards: true,
      imdb_id: true,
      tmdb_id: true,
      imdb_url: true,
      imdb_rating: true,
      rt_rating_pct: true,
      imdb_votes: true,
      poster_path: true,
    },
  });

  if (!row) return null;

  const { poster_path, ...rest } = row;

  return {
    ...rest,
    poster_url: buildPosterUrl(poster_path),
  };
}

/**
 * Get people for a film grouped by role.
 * Output shape: { directors: string[], writers: string[], cast: string[] }
 */
export async function getFilmPeople(id) {
  const rows = await prisma.film_person.findMany({
    where: { film_id: Number(id) },
    select: {
      role: true,
      person: { select: { name: true } },
    },
    orderBy: [{ person: { name: 'asc' } }],
  });

  const rolePriority = { director: 1, writer: 2, cast: 3 };
  rows.sort(
    (a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
  );

  const directors = [];
  const writers = [];
  const cast = [];

  for (const r of rows) {
    const name = r.person?.name ?? '';
    if (!name) continue;
    if (r.role === 'director') directors.push(name);
    else if (r.role === 'writer') writers.push(name);
    else if (r.role === 'cast') cast.push(name);
  }

  return { directors, writers, cast };
}

/**
 * Upcoming screenings for a film.
 * Returns the same column names/aliases as your old SQL version.
 */
export async function getUpcomingForFilm(id, opts = {}) {
  const { limit = 200 } = opts;

  const rows = await prisma.screening.findMany({
    where: {
      film_id: Number(id),
      is_active: true,
      start_at_utc: { gte: new Date() },
    },
    orderBy: { start_at_utc: 'asc' },
    take: Number(limit),
    select: {
      id: true,
      start_at_utc: true,
      end_at_utc: true,
      runtime_min: true,
      source_url: true,
      film: { select: { title: true } },
      cinema: { select: { id: true, name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.film?.title ?? null,
    start_at_utc: r.start_at_utc,
    end_at_utc: r.end_at_utc,
    runtime_min: r.runtime_min,
    cinema_id: r.cinema?.id ?? null,
    cinema_name: r.cinema?.name ?? null,
    source_url: r.source_url,
  }));
}