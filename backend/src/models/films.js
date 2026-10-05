import { prisma } from '../lib/prismaClient.js';
import { buildPosterUrl } from '../utils/posterUrl.js';
import { SCREENING_SELECT, flattenScreeningRow } from './screeningSelect.js';

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
      cinema: { select: { id: true, name: true, website: true } },
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
    cinema_website: r.cinema?.website ?? null,
    source_url: r.source_url,
  }));
}

/** Splits a raw, comma separated OMDb genre string into clean tokens,
 * dropping placeholders like "N/A". Mirrors
 * frontend/app/lib/formatGenre.ts's filtering, kept separate since this
 * runs server side against Prisma query conditions, not display text. */
function parseGenreTokens(genre) {
  if (!genre) return [];
  return genre
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && g.toUpperCase() !== 'N/A');
}

/** Dedupes screening rows down to one per film (keeping the first
 * occurrence — callers pass rows already ordered soonest-first, tie
 * broken by highest rating, so "first" is the right one to keep), and
 * drops any film already present in `excludeFilmIds`. */
function dedupeByFilm(rows, excludeFilmIds) {
  const seen = new Set(excludeFilmIds);
  const out = [];
  for (const r of rows) {
    const id = r.film?.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

/**
 * Related films for a film detail page: other currently screening films
 * sharing a director, then genre, then cinema with the given film —
 * ranked within each bucket by soonest upcoming screening, tie broken by
 * higher imdb_rating. See docs/specs/related-films.md for the full
 * reasoning (data investigation, why rule based matching and not
 * embeddings/collaborative filtering, why this priority order).
 *
 * @returns {Promise<object[]>} Up to `limit` rows in the same flat shape
 *   `fetchScreenings` returns (frontend's `Screening` type) — each row is
 *   the matched film's own soonest upcoming screening, not necessarily a
 *   screening of the film passed in.
 */
export async function getRelatedFilms(filmId, opts = {}) {
  const { limit = 6 } = opts;
  const id = Number(filmId);
  const now = new Date();

  const target = await prisma.film.findUnique({
    where: { id },
    select: {
      genre: true,
      film_person: {
        where: { role: 'director' },
        select: { person_id: true },
      },
    },
  });
  if (!target) return [];

  const directorIds = target.film_person.map((fp) => fp.person_id);
  const genreTokens = parseGenreTokens(target.genre);

  const targetCinemaRows = await prisma.screening.findMany({
    where: { film_id: id, is_active: true, start_at_utc: { gte: now } },
    select: { cinema_id: true },
    distinct: ['cinema_id'],
  });
  const cinemaIds = targetCinemaRows.map((r) => r.cinema_id);

  const orderBy = [
    { start_at_utc: 'asc' },
    { film: { imdb_rating: { sort: 'desc', nulls: 'last' } } },
  ];

  async function fetchBucket(whereExtra) {
    return prisma.screening.findMany({
      where: {
        is_active: true,
        start_at_utc: { gte: now },
        film_id: { not: id },
        ...whereExtra,
      },
      select: SCREENING_SELECT,
      orderBy,
    });
  }

  const picked = [];

  if (directorIds.length > 0) {
    const rows = await fetchBucket({
      film: {
        film_person: {
          some: { role: 'director', person_id: { in: directorIds } },
        },
      },
    });
    picked.push(...dedupeByFilm(rows, []));
  }

  if (picked.length < limit && genreTokens.length > 0) {
    const rows = await fetchBucket({
      OR: genreTokens.map((token) => ({ film: { genre: { contains: token } } })),
    });
    picked.push(
      ...dedupeByFilm(
        rows,
        picked.map((r) => r.film.id)
      )
    );
  }

  if (picked.length < limit && cinemaIds.length > 0) {
    const rows = await fetchBucket({ cinema_id: { in: cinemaIds } });
    picked.push(
      ...dedupeByFilm(
        rows,
        picked.map((r) => r.film.id)
      )
    );
  }

  return picked.slice(0, limit).map(flattenScreeningRow);
}