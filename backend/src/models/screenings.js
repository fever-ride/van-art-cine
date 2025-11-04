import { prisma } from '../lib/prismaClient.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';


export async function fetchScreenings(opts = {}) {
  const {
    date, from, to,
    cinemaId,      // keep
    cinemaIds,     // added
    filmId,
    q,
    sort = 'time',
    order = 'ASC',
    limit = 50,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  const safeOrder = (String(order).toLowerCase() === 'desc') ? 'desc' : 'asc';

  // --- Time window (UTC) logic ---
  let gte = null;
  let lt = null;

  if (date) {
    const [utcStart, utcEnd] = localDayToUtcRange(date, tz);
    gte = utcStart ?? null;
    lt = utcEnd ?? null;
  } else {
    const [utcRangeStart, utcRangeEnd] = localRangeToUtc(from, to, tz);
    gte = utcRangeStart ?? new Date();
    lt = utcRangeEnd ?? null;
  }

  // --- Prisma where clause ---
  const where = {
    is_active: true,
    ...(gte || lt ? { start_at_utc: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
    
    ...((() => {
      if (cinemaIds && Array.isArray(cinemaIds) && cinemaIds.length > 0) {
        return { cinema_id: { in: cinemaIds.map(Number) } };
      } else if (Number.isFinite(cinemaId)) {
        return { cinema_id: Number(cinemaId) };
      }
      return {};
    })()),
    
    ...(Number.isFinite(filmId) ? { film_id: Number(filmId) } : {}),
    ...(q ? { film: { normalized_title: { contains: q } } } : {}),
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
  let orderBy;
  const sortKey = String(sort);

  if (sortKey === 'time') {
    orderBy = [{ start_at_utc: safeOrder }];
  } else if (sortKey === 'title') {
    orderBy = [{ film: { title: safeOrder } }];
  } else if (sortKey === 'imdb') {
    orderBy = [{ film: { imdb_rating: safeOrder } }];
  } else if (sortKey === 'rt') {
    orderBy = [{ film: { rt_rating_pct: safeOrder } }];
  } else if (sortKey === 'votes') {
    orderBy = [{ film: { imdb_votes: safeOrder } }];
  } else if (sortKey === 'year') {
    orderBy = [{ film: { year: safeOrder } }];
  }

  const rowsRaw = await prisma.screening.findMany({
    where,
    select: baseSelect,
    orderBy,
    skip: Number(offset),
    take: Number(limit),
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