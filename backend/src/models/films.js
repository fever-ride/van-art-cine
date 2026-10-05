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

/** Splits a raw, comma separated OMDb-style string (genre/country/language)
 * into clean, lowercased tokens, dropping placeholders like "N/A". Mirrors
 * frontend/app/lib/formatGenre.ts's filtering, kept separate since this
 * runs server side for similarity scoring, not display text. */
function splitCsvTokens(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0 && v !== 'n/a');
}

/** Jaccard similarity (intersection / union) of two token sets, in [0, 1].
 * 0 when either set is empty — an unknown field should never contribute a
 * match, rather than looking identical to a genuine empty-set tie. */
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Count of ids present in both sets — used for director/cast, where a
 * single shared person is a much stronger signal than a fractional
 * similarity score, and more than one shared person should count for more. */
function countShared(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/** Relative weight of each similarity signal in `getRelatedFilms`'s score.
 * Director and cast are counted per shared person (so e.g. two shared cast
 * members score higher than one); genre/country/language are Jaccard
 * similarity in [0, 1]; cinema is a flat bonus for sharing any venue.
 * Director outweighs a cast member because directorial voice carries more
 * of a film's identity than any single actor; cinema is intentionally the
 * smallest signal — it's about logistics (what's already playing near you),
 * not content similarity, and exists mainly so a film with no other
 * matching metadata still surfaces something instead of an empty section. */
const SCORE_WEIGHTS = {
  director: 3,
  cast: 1,
  genre: 2,
  country: 1,
  language: 1,
  cinema: 0.5,
};

function personIdsByRole(filmPerson, role) {
  return new Set(filmPerson.filter((fp) => fp.role === role).map((fp) => fp.person_id));
}

/**
 * Related films for a film detail page: other currently screening films
 * ranked by a weighted similarity score (shared director/cast, genre,
 * country, and language overlap, plus a small same-cinema bonus), tie
 * broken by soonest upcoming screening then higher imdb_rating. Replaces an
 * earlier director > genre > cinema priority-bucket design, which let a
 * single shared bucket (e.g. a common genre tag) fully decide the result
 * regardless of how many other signals two films actually shared. See
 * docs/specs/related-films.md for the full reasoning.
 *
 * @returns {Promise<object[]>} Up to `limit` rows in the same flat shape
 *   `fetchScreenings` returns (frontend's `Screening` type) — each row is
 *   the matched film's own soonest upcoming screening, not necessarily a
 *   screening of the film passed in.
 */
export async function getRelatedFilms(filmId, opts = {}) {
  const { limit = 10 } = opts;
  const id = Number(filmId);
  const now = new Date();

  const target = await prisma.film.findUnique({
    where: { id },
    select: {
      genre: true,
      country: true,
      language: true,
      film_person: { select: { person_id: true, role: true } },
    },
  });
  if (!target) return [];

  const targetDirectors = personIdsByRole(target.film_person, 'director');
  const targetCast = personIdsByRole(target.film_person, 'cast');
  const targetGenres = new Set(splitCsvTokens(target.genre));
  const targetCountries = new Set(splitCsvTokens(target.country));
  const targetLanguages = new Set(splitCsvTokens(target.language));

  const targetCinemaRows = await prisma.screening.findMany({
    where: { film_id: id, is_active: true, start_at_utc: { gte: now } },
    select: { cinema_id: true },
    distinct: ['cinema_id'],
  });
  const targetCinemas = new Set(targetCinemaRows.map((r) => r.cinema_id));

  const hasAnySignal =
    targetDirectors.size > 0 ||
    targetCast.size > 0 ||
    targetGenres.size > 0 ||
    targetCountries.size > 0 ||
    targetLanguages.size > 0 ||
    targetCinemas.size > 0;
  if (!hasAnySignal) return [];

  const poolRows = await prisma.screening.findMany({
    where: { is_active: true, start_at_utc: { gte: now }, film_id: { not: id } },
    select: {
      film_id: true,
      cinema_id: true,
      start_at_utc: true,
      film: {
        select: {
          genre: true,
          country: true,
          language: true,
          imdb_rating: true,
          film_person: { select: { person_id: true, role: true } },
        },
      },
    },
    orderBy: { start_at_utc: 'asc' },
  });

  // Group by film: a film can have several upcoming screenings, but it
  // should be scored once, using the union of every cinema it plays at and
  // its soonest screening (rows already arrive soonest-first) for ranking.
  const byFilm = new Map();
  for (const row of poolRows) {
    const existing = byFilm.get(row.film_id);
    if (!existing) {
      byFilm.set(row.film_id, {
        film_id: row.film_id,
        film: row.film,
        soonestStartAtUtc: row.start_at_utc,
        cinemaIds: new Set([row.cinema_id]),
      });
    } else {
      existing.cinemaIds.add(row.cinema_id);
    }
  }

  const scored = [];
  for (const entry of byFilm.values()) {
    const directors = personIdsByRole(entry.film.film_person, 'director');
    const cast = personIdsByRole(entry.film.film_person, 'cast');
    const genres = new Set(splitCsvTokens(entry.film.genre));
    const countries = new Set(splitCsvTokens(entry.film.country));
    const languages = new Set(splitCsvTokens(entry.film.language));
    const sharesCinema = [...entry.cinemaIds].some((c) => targetCinemas.has(c));

    const score =
      SCORE_WEIGHTS.director * countShared(targetDirectors, directors) +
      SCORE_WEIGHTS.cast * countShared(targetCast, cast) +
      SCORE_WEIGHTS.genre * jaccard(targetGenres, genres) +
      SCORE_WEIGHTS.country * jaccard(targetCountries, countries) +
      SCORE_WEIGHTS.language * jaccard(targetLanguages, languages) +
      (sharesCinema ? SCORE_WEIGHTS.cinema : 0);

    if (score > 0) {
      scored.push({
        film_id: entry.film_id,
        score,
        soonestStartAtUtc: entry.soonestStartAtUtc,
        imdb_rating: entry.film.imdb_rating,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const byTime = new Date(a.soonestStartAtUtc) - new Date(b.soonestStartAtUtc);
    if (byTime !== 0) return byTime;
    return (b.imdb_rating ?? -Infinity) - (a.imdb_rating ?? -Infinity);
  });

  const topFilmIds = scored.slice(0, limit).map((s) => s.film_id);
  if (topFilmIds.length === 0) return [];

  const winnerRows = await prisma.screening.findMany({
    where: { is_active: true, start_at_utc: { gte: now }, film_id: { in: topFilmIds } },
    select: SCREENING_SELECT,
    orderBy: { start_at_utc: 'asc' },
  });

  const seen = new Set();
  const bestRowByFilm = new Map();
  for (const row of winnerRows) {
    if (seen.has(row.film.id)) continue;
    seen.add(row.film.id);
    bestRowByFilm.set(row.film.id, row);
  }

  return topFilmIds
    .map((fid) => bestRowByFilm.get(fid))
    .filter(Boolean)
    .map(flattenScreeningRow);
}