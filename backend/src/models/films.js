import { prisma } from '../lib/prismaClient.js';

/**
 * Get a single film by ID.
 * Returns the same shape as your SQL: a row with selected columns or null.
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
    },
  });
  return row ?? null;
}

/**
 * Get people for a film grouped by role.
 * Preserves output: { directors: string[], writers: string[], cast: string[] }
 */
export async function getFilmPeople(id) {
  // Fetch role + joined person name
  const rows = await prisma.film_person.findMany({
    where: { film_id: Number(id) },
    select: {
      role: true,
      person: { select: { name: true } },
    },
    // DB-level sort by person name; we'll apply role priority below
    orderBy: [{ person: { name: 'asc' } }],
  });

  // Emulate CASE-based priority: director → writer → cast → others
  const rolePriority = { director: 1, writer: 2, cast: 3 };
  rows.sort((a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99));

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
 * Returns the same column names/aliases as your SQL version.
 */
export async function getUpcomingForFilm(id, { limit = 200 } = {}) {
  const rows = await prisma.screening.findMany({
    where: {
      film_id: Number(id),
      is_active: true, // Prisma maps TINYINT(1) -> Boolean
      start_at_utc: { gte: new Date() }, // UTC comparison
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

  // Map to original SQL result shape
  return rows.map((r) => ({
    id: r.id,                           // screening id
    title: r.film?.title ?? null,       // film title
    start_at_utc: r.start_at_utc,
    end_at_utc: r.end_at_utc,
    runtime_min: r.runtime_min,
    cinema_id: r.cinema?.id ?? null,
    cinema_name: r.cinema?.name ?? null,
    source_url: r.source_url,
  }));
}