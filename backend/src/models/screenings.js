import { prisma } from '../lib/prismaClient.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';

/**
 * NOTE: We no longer build raw SQL. We keep the function so callers don't break,
 * but it now returns a summary of the effective Prisma filters (for debugging).
 */
export function buildScreeningsQuery(opts = {}) {
  const {
    date, from, to,
    cinemaId, filmId,
    q,
    sort = 'time',
    order = 'ASC',
    limit = 50,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  // Keep the same defaults so behavior matches your existing route.
  const sortMap = {
    time:  's.start_at_utc',
    title: 'f.title',
    imdb:  'COALESCE(f.imdb_rating, -1)',
    rt:    'COALESCE(f.rt_rating_pct, -1)',
    votes: 'COALESCE(f.imdb_votes, -1)',
    year:  'COALESCE(f.year, 0)',
  };
  const safeOrder = (String(order).toLowerCase() === 'desc') ? 'DESC' : 'ASC';

  // For compatibility we return a small object that mirrors the intent.
  return {
    sql: '[prisma]', // marker so callers know this is Prisma now
    params: [],
    opts: { date, from, to, cinemaId, filmId, q, sort, order: safeOrder, limit, offset, tz },
  };
}

/**
 * Fetch screenings with the same filters and output columns as the old SQL.
 * Output rows shape:
 * {
 *   id, title, start_at_utc, end_at_utc, runtime_min, tz,
 *   cinema_id, cinema_name,
 *   film_id, imdb_id, tmdb_id, year,
 *   directors, description, rated, genre, language, country, awards,
 *   imdb_rating, rt_rating_pct, imdb_votes,
 *   source_url, imdb_url
 * }
 */
export async function fetchScreenings(opts = {}) {
  const {
    date, from, to,
    cinemaId, filmId,
    q,
    sort = 'time',
    order = 'ASC',
    limit = 50,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  const safeOrder = (String(order).toLowerCase() === 'desc') ? 'desc' : 'asc';

  // --- Time window (UTC) logic, matching your SQL fallbacks ---
  let gte = null;
  let lt = null;

  if (date) {
    const [utcStart, utcEnd] = localDayToUtcRange(date, tz);
    gte = utcStart ?? null;
    lt = utcEnd ?? null;
  } else {
    const [utcRangeStart, utcRangeEnd] = localRangeToUtc(from, to, tz);
    gte = utcRangeStart ?? new Date(); // SQL default was UTC_TIMESTAMP() if from missing
    lt = utcRangeEnd ?? null;
  }

  // --- Prisma where clause mirroring your SQL WHERE ---
  const where = {
    is_active: true, // was 1 in SQL
    ...(gte || lt ? { start_at_utc: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
    ...(Number.isFinite(cinemaId) ? { cinema_id: Number(cinemaId) } : {}),
    ...(Number.isFinite(filmId)   ? { film_id: Number(filmId) }   : {}),
    ...(q
      ? { film: { normalized_title: { contains: q, mode: 'insensitive' } } }
      : {}),
  };

  // --- Include the relations we need to reproduce the SELECT/LEFT JOINs ---
  // We fetch film + cinema, and film_person with role='director' to build the directors string.
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
        // Pull directors; we’ll stringify and order by name in JS
        film_person: {
          where: { role: 'director' },
          select: { person: { select: { name: true } } },
        },
      },
    },
    cinema: { select: { id: true, name: true } },
  };

  // --- Ordering & pagination ---
  // DB can only natively order by a real column; the old SQL used COALESCE for nulls.
  // Strategy:
  //   - For sort 'time' and 'title', we can use DB orderBy.
  //   - For imdb/rt/votes/year, fetch enough rows and sort in JS using the same fallback values.
  let orderBy = undefined;
  const sortKey = String(sort);
  const isDbSortable =
    sortKey === 'time' || sortKey === 'title';

  if (sortKey === 'time') {
    orderBy = [{ start_at_utc: safeOrder }];
  } else if (sortKey === 'title') {
    // order by film.title
    orderBy = [{ film: { title: safeOrder } }];
  }

  // To preserve LIMIT/OFFSET semantics when we must sort in JS,
  // we fetch (offset + limit) rows (capped) then slice.
  const take = isDbSortable
    ? Number(limit)
    : Math.min(Number(offset) + Number(limit), 1000); // safety cap

  const rowsRaw = await prisma.screening.findMany({
    where,
    select: baseSelect,
    ...(orderBy ? { orderBy } : {}),
    ...(isDbSortable ? { skip: Number(offset), take } : { take }), // only skip when DB-ordered
  });

  // Build directors string and flatten to the original SELECT shape
  let flattened = rowsRaw.map((s) => {
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

  // JS-side sorting for imdb / rt / votes / year with the same COALESCE defaults
  if (!isDbSortable) {
    const keyMap = {
      imdb:  { key: 'imdb_rating',  fallback: -1 },
      rt:    { key: 'rt_rating_pct', fallback: -1 },
      votes: { key: 'imdb_votes',    fallback: -1 },
      year:  { key: 'year',          fallback: 0  },
    };
    const { key, fallback } = keyMap[sortKey] ?? keyMap.imdb;

    flattened.sort((a, b) => {
      const av = a[key] ?? fallback;
      const bv = b[key] ?? fallback;
      if (av === bv) return 0;
      return safeOrder === 'asc' ? (av - bv) : (bv - av);
    });

    // Apply offset/limit after JS sort
    flattened = flattened.slice(Number(offset), Number(offset) + Number(limit));
  }

  return flattened;
}

/**
 * Find screenings by IDs with the original LEFT JOIN shape + status column.
 * Output rows shape:
 * {
 *   id, start_at_utc, end_at_utc, runtime_min, tz,
 *   film_id, title, year, imdb_rating, rt_rating_pct,
 *   cinema_id, cinema_name,
 *   source_url,
 *   status  ('missing' | 'inactive' | 'past' | 'upcoming')
 * }
 */
export async function findByIds({ ids, includePast }) {
  if (!ids?.length) return [];

  const now = new Date();

  // Base query. If includePast === false, mirror:
  //   AND s.is_active = 1 AND s.start_at_utc >= UTC_TIMESTAMP()
  const where = {
    id: { in: ids.map(Number) },
    ...(includePast
      ? {}
      : {
          is_active: true,
          start_at_utc: { gte: now },
        }),
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

  // Map to original aliasing + status computation
  const mapped = rows.map((s) => {
    const exists = !!s; // always true here; if ID didn't exist it wouldn't be returned
    const active = exists ? !!s.is_active : false;
    const start = exists ? s.start_at_utc : null;

    let status;
    if (!exists) status = 'missing';
    else if (!active) status = 'inactive';
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