import { prisma } from '../lib/prismaClient.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';

/**
 * Screening list queries for the public API.
 *
 * `fetchScreenings` powers GET /api/screenings with filters, sort, and pagination.
 * `findByIds` loads specific rows (e.g. watchlist bulk) and adds a derived `status`.
 */

/**
 * List active screenings with optional filters, sort, and pagination.
 *
 * @param {object} opts
 * @param {string} [opts.date]           Single local calendar day (YYYY-MM-DD); mutually exclusive with from/to in practice
 * @param {string} [opts.from]         Range start (local, ISO date string)
 * @param {string} [opts.to]           Range end (local)
 * @param {number[]} [opts.cinemaIds]  Restrict to these cinema IDs
 * @param {number} [opts.filmId]       Restrict to this film
 * @param {string} [opts.q]            Substring match on film.normalized_title (already lowercased by controller)
 * @param {string} [opts.sort]         time | title | imdb | rt | votes | year
 * @param {string} [opts.order]        ASC | DESC
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @param {string} [opts.tz]           IANA zone for date/range → UTC (default America/Vancouver)
 * @returns {Promise<object[]>} Flat rows with film + cinema fields denormalized for the API
 */
export async function fetchScreenings(opts = {}) {
  const {
    date, from, to,
    cinemaIds,
    filmId,
    q,
    sort = 'time',
    order = 'ASC',
    limit = 50,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  const safeOrder = (String(order).toLowerCase() === 'desc') ? 'desc' : 'asc';

  // Resolve [gte, lt) in UTC for start_at_utc: either one calendar day or an arbitrary local range.
  let gte, lt;

  if (date) {
    const [utcStart, utcEnd] = localDayToUtcRange(date, tz);
    gte = utcStart ?? null;
    lt = utcEnd ?? null;
  } else {
    const [utcRangeStart, utcRangeEnd] = localRangeToUtc(from, to, tz);
    gte = utcRangeStart ?? new Date();
    lt = utcRangeEnd ?? null;
  }

  // Optional lower bound / upper bound on screening start (half-open interval in UTC).
  const startAtUtc =
    gte || lt
      ? {
          start_at_utc: {
            ...(gte ? { gte } : {}),
            ...(lt ? { lt } : {}),
          },
        }
      : {};

  const where = {
    is_active: true,
    ...startAtUtc,
    ...(cinemaIds?.length > 0
      ? { cinema_id: { in: cinemaIds.map(Number) } }
      : {}),
    ...(Number.isFinite(filmId) ? { film_id: Number(filmId) } : {}),
    ...(q
      ? { film: { normalized_title: { contains: q } } }
      : {}),
  };

  // Load related film (incl. directors), cinema; directors flattened to a string below.
  const baseSelect = {
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
        film_person: {
          where: { role: 'director' },
          select: { person: { select: { name: true } } },
        },
      },
    },
    cinema: { select: { id: true, name: true } },
  };

  let orderBy;
  const sortKey = String(sort);
  const ratingOrder = { sort: safeOrder, nulls: 'last' };

  if (sortKey === 'time') {
    orderBy = [{ start_at_utc: safeOrder }];
  } else if (sortKey === 'title') {
    orderBy = [{ film: { title: safeOrder } }, { start_at_utc: 'asc' }];
  } else if (sortKey === 'imdb') {
    orderBy = [
      { film: { imdb_rating: ratingOrder } },
      { film: { title: 'asc' } },
      { start_at_utc: 'asc' },
    ];
  } else if (sortKey === 'rt') {
    orderBy = [
      { film: { rt_rating_pct: ratingOrder } },
      { film: { title: 'asc' } },
      { start_at_utc: 'asc' },
    ];
  } else if (sortKey === 'votes') {
    orderBy = [
      { film: { imdb_votes: { sort: safeOrder, nulls: 'last' } } },
      { film: { title: 'asc' } },
      { start_at_utc: 'asc' },
    ];
  } else if (sortKey === 'year') {
    orderBy = [
      { film: { year: { sort: safeOrder, nulls: 'last' } } },
      { film: { title: 'asc' } },
      { start_at_utc: 'asc' },
    ];
  }

  const rowsRaw = await prisma.screening.findMany({
    where,
    select: baseSelect,
    orderBy,
    skip: Number(offset),
    take: Number(limit),
  });

  // Denormalize to the legacy API shape: single directors string, film fields at top level.
  const flattened = rowsRaw.map((s) => {
    const film = s.film ?? {};
    const cinema = s.cinema ?? {};
    const directors =
      (film.film_person ?? [])
        .map(fp => fp.person?.name)
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
    };
  });

  return flattened;
}

/**
 * Load screenings by primary key IDs for bulk endpoints (e.g. watchlist).
 * IDs that do not exist are omitted; there is no placeholder row per missing ID.
 *
 * @param {object} params
 * @param {number[]} params.ids
 * @param {boolean} [params.includePast]  If false/omitted, only active rows with start_at_utc >= now
 * @returns {Promise<object[]>} One object per found row, plus `status` for UI
 */
export async function findByIds({ ids, includePast }) {
  if (!ids?.length) return [];

  const now = new Date();

  // When includePast is not true, match legacy behaviour: only active, not-yet-started screenings.
  const upcomingOnly =
    includePast
      ? {}
      : {
          is_active: true,
          start_at_utc: { gte: now },
        };

  const where = {
    id: { in: ids.map(Number) },
    ...upcomingOnly,
  };

  const rows = await prisma.screening.findMany({
    where,
    orderBy: [{ start_at_utc: 'asc' }],
    select: {
      id: true,
      start_at_utc: true,
      end_at_utc: true,
      runtime_min: true,
      tz: true,
      is_active: true,
      source_url: true,
      film: {
        select: {
          id: true,
          title: true,
          year: true,
          imdb_rating: true,
          rt_rating_pct: true,
        },
      },
      cinema: {
        select: { id: true, name: true },
      },
    },
  });

  const mapped = rows.map((s) => {
    const active = !!s.is_active;
    const start = s.start_at_utc;

    let status;
    if (!active) status = 'inactive';
    else if (start && start < now) status = 'past';
    else status = 'upcoming';

    return {
      id: s.id,
      start_at_utc: s.start_at_utc,
      end_at_utc: s.end_at_utc,
      runtime_min: s.runtime_min,
      tz: s.tz,
      film_id: s.film?.id ?? null,
      title: s.film?.title ?? null,
      year: s.film?.year ?? null,
      imdb_rating: s.film?.imdb_rating ?? null,
      rt_rating_pct: s.film?.rt_rating_pct ?? null,
      cinema_id: s.cinema?.id ?? null,
      cinema_name: s.cinema?.name ?? null,
      source_url: s.source_url ?? null,
      status,
    };
  });

  return mapped;
}
