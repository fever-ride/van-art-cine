import { prisma } from '../lib/prismaClient.js';
import { localDayToUtcRange, localRangeToUtc } from '../utils/time.js';
import { SCREENING_SELECT, flattenScreeningRow } from './screeningSelect.js';
import { YEAR_ERAS, eraYearCondition, eraForYear } from '../utils/yearEras.js';
import { IMDB_RATING_THRESHOLDS, RT_RATING_THRESHOLDS } from '../utils/ratingThresholds.js';

/**
 * Screening list queries for the public API.
 *
 * `fetchScreenings` powers GET /api/screenings with filters, sort, and pagination.
 * `findByIds` loads specific rows (e.g. watchlist bulk) and adds a derived `status`.
 */

/**
 * Builds the Prisma `where` clause shared by every query that answers "which
 * screening rows match these filters" — `fetchScreenings` (row-paginated,
 * powers Table view) and `fetchFilms` (film-paginated, powers Film view).
 * Both views are filtering the exact same underlying screenings by the exact
 * same rules; only how the matching rows get paginated and shaped differs.
 * Pulled out so that rule never has to be kept in sync by hand across the two.
 *
 * @param {object} opts
 * @param {string} [opts.date]           Single local calendar day (YYYY-MM-DD); mutually exclusive with from/to in practice
 * @param {string} [opts.from]         Range start (local, ISO date string)
 * @param {string} [opts.to]           Range end (local)
 * @param {number[]} [opts.cinemaIds]  Restrict to these cinema IDs
 * @param {number} [opts.filmId]       Restrict to this film
 * @param {string} [opts.q]            Substring match on film.normalized_title (already lowercased by controller)
 * @param {string[]} [opts.genres]     Restrict to films whose genre field contains any of these tokens (OR)
 * @param {string[]} [opts.languages]  Restrict to films whose language field contains any of these tokens (OR)
 * @param {string[]} [opts.eras]       Restrict to films whose year falls in any of these era buckets (OR) — see `yearEras.js`
 * @param {number} [opts.minImdbRating]  Restrict to films with imdb_rating >= this
 * @param {number} [opts.minRtRating]    Restrict to films with rt_rating_pct >= this
 * @param {string} [opts.tz]           IANA zone for date/range → UTC (default America/Vancouver)
 * @returns {object} Prisma `where` for `screening`
 */
function buildScreeningWhere(opts = {}) {
  const {
    date, from, to,
    cinemaIds,
    filmId,
    q,
    genres,
    languages,
    eras,
    minImdbRating,
    minRtRating,
    tz = 'America/Vancouver',
  } = opts;

  // Resolve [gte, lt) in UTC for start_at_utc: either one calendar day or an arbitrary local range.
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

  // Genre and language are each an explicit, user-chosen "show me anything
  // tagged X or Y" facet — unlike the related-films scoring model (which
  // deliberately avoids "any shared token" for a passive recommendation,
  // see docs/specs/related-films.md), checking two genre boxes is supposed
  // to widen the result set, not narrow it. Each facet's own checked values
  // OR together; the two facets then AND against each other. Built as a
  // Prisma `AND` array (not a second `OR` key) — Prisma's `where` is a
  // plain object, so two same-named `OR` keys here would silently
  // overwrite rather than combine.
  const facetConditions = [];
  if (genres?.length > 0) {
    facetConditions.push({
      OR: genres.map((g) => ({ film: { genre: { contains: g, mode: 'insensitive' } } })),
    });
  }
  if (languages?.length > 0) {
    facetConditions.push({
      OR: languages.map((l) => ({ film: { language: { contains: l, mode: 'insensitive' } } })),
    });
  }
  // Era buckets (see yearEras.js) behave exactly like genre/language — a
  // real, discrete, data-driven value a reader multi-selects, OR'd
  // together — the only difference is the value is derived from a numeric
  // `year` range instead of read directly off a text field.
  if (eras?.length > 0) {
    const yearConditions = eras
      .map((key) => eraYearCondition(key))
      .filter(Boolean)
      .map((yearCond) => ({ film: { year: yearCond } }));
    if (yearConditions.length > 0) facetConditions.push({ OR: yearConditions });
  }

  // q/minImdbRating/minRtRating all constrain fields on the same nested
  // `film` relation — merged into one `film` object rather than three
  // separate `{ film: {...} }` spreads, which would silently overwrite
  // each other the same way two same-named `OR` keys would (see the
  // facetConditions note above).
  const filmConditions = {
    ...(q ? { normalized_title: { contains: q } } : {}),
    ...(Number.isFinite(minImdbRating) ? { imdb_rating: { gte: minImdbRating } } : {}),
    ...(Number.isFinite(minRtRating) ? { rt_rating_pct: { gte: minRtRating } } : {}),
  };

  return {
    is_active: true,
    ...startAtUtc,
    ...(cinemaIds?.length > 0
      ? { cinema_id: { in: cinemaIds.map(Number) } }
      : {}),
    ...(Number.isFinite(filmId) ? { film_id: Number(filmId) } : {}),
    ...(Object.keys(filmConditions).length > 0 ? { film: filmConditions } : {}),
    ...(facetConditions.length > 0 ? { AND: facetConditions } : {}),
  };
}

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
 * @param {string[]} [opts.genres]     Restrict to films whose genre field contains any of these tokens (OR)
 * @param {string[]} [opts.languages]  Restrict to films whose language field contains any of these tokens (OR)
 * @param {string[]} [opts.eras]       Restrict to films whose year falls in any of these era buckets (OR)
 * @param {number} [opts.minImdbRating]  Restrict to films with imdb_rating >= this
 * @param {number} [opts.minRtRating]    Restrict to films with rt_rating_pct >= this
 * @param {string} [opts.sort]         time | title | imdb | rt | votes | year
 * @param {string} [opts.order]        ASC | DESC
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @param {string} [opts.tz]           IANA zone for date/range → UTC (default America/Vancouver)
 * @returns {Promise<{items: object[], total: number}>} `items`: flat rows with film + cinema
 *   fields denormalized for the API. `total`: count of all matching rows for this `where`,
 *   ignoring limit/offset — for computing page count, not just this page's `items.length`.
 */
export async function fetchScreenings(opts = {}) {
  const {
    date, from, to,
    cinemaIds,
    filmId,
    q,
    genres,
    languages,
    eras,
    minImdbRating,
    minRtRating,
    sort = 'time',
    order = 'ASC',
    limit = 50,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  const safeOrder = (String(order).toLowerCase() === 'desc') ? 'desc' : 'asc';
  const where = buildScreeningWhere({
    date, from, to, cinemaIds, filmId, q, genres, languages, eras, minImdbRating, minRtRating, tz,
  });

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

  const [rowsRaw, total] = await Promise.all([
    prisma.screening.findMany({
      where,
      select: SCREENING_SELECT,
      orderBy,
      skip: Number(offset),
      take: Number(limit),
    }),
    prisma.screening.count({ where }),
  ]);

  return { items: rowsRaw.map(flattenScreeningRow), total };
}

/**
 * List films (not screenings) matching the same filters `fetchScreenings`
 * supports, paginated by distinct film count, each film carrying its own
 * full showtimes list. Powers Film view's `GET /api/films` — fixes the bug
 * where row-based pagination split one film's showtimes across page
 * boundaries, making it appear as a separate, incomplete card on each page.
 *
 * Three steps, each reusing an existing shared piece rather than
 * reinventing it:
 *   1. Find which distinct film_ids match the filters and page through
 *      *that* list (not the screening rows) — `groupBy` on film_id, sorted
 *      by each film's own soonest showtime. The catalog is small enough
 *      (~200-300 active screenings) that pulling every matching film_id
 *      and slicing in JS is simpler than a second synced count query, and
 *      is the same "fetch everything, group in JS" shape already used by
 *      `getScreeningFacets`.
 *   2. Batch-fetch *every* screening for just this page's film_ids via
 *      `SCREENING_SELECT`/`flattenScreeningRow` (same shared module
 *      `fetchScreenings` and `getRelatedFilms` already use) — one batched
 *      query (well, Prisma's own batching per relation level), not one
 *      query per film, so this doesn't become the N+1 pattern that calling
 *      `getFilmById`-style single-film functions in a loop would.
 *   3. Group the flat rows into one entry per film — a backend-side mirror
 *      of the frontend's `groupScreeningsByFilm` (frontend/lib), since here
 *      the grouping needs to happen before the response is shaped, not
 *      after it reaches the client.
 *
 * @param {object} opts  Same filter fields as `fetchScreenings` (date/from/to,
 *   cinemaIds, q, genres, languages, tz), plus `limit`/`offset` — here counted
 *   in films, not screenings.
 * @returns {Promise<{items: object[], total: number}>} `total` is the count of
 *   distinct matching films, not screenings.
 */
export async function fetchFilms(opts = {}) {
  const {
    date, from, to,
    cinemaIds,
    q,
    genres,
    languages,
    eras,
    minImdbRating,
    minRtRating,
    limit = 20,
    offset = 0,
    tz = 'America/Vancouver',
  } = opts;

  const where = buildScreeningWhere({
    date, from, to, cinemaIds, q, genres, languages, eras, minImdbRating, minRtRating, tz,
  });

  const grouped = await prisma.screening.groupBy({
    by: ['film_id'],
    where,
    _min: { start_at_utc: true },
    orderBy: { _min: { start_at_utc: 'asc' } },
  });

  const total = grouped.length;
  const pageFilmIds = grouped
    .slice(Number(offset), Number(offset) + Number(limit))
    .map((g) => g.film_id);

  if (pageFilmIds.length === 0) return { items: [], total };

  const rows = await prisma.screening.findMany({
    where: { ...where, film_id: { in: pageFilmIds } },
    select: SCREENING_SELECT,
    orderBy: { start_at_utc: 'asc' },
  });

  const byFilm = new Map();
  for (const row of rows.map(flattenScreeningRow)) {
    let group = byFilm.get(row.film_id);
    if (!group) {
      group = {
        film_id: row.film_id,
        title: row.title,
        directors: row.directors,
        poster_url: row.poster_url,
        genre: row.genre,
        country: row.country,
        language: row.language,
        year: row.year,
        description: row.description,
        rated: row.rated,
        imdb_rating: row.imdb_rating,
        rt_rating_pct: row.rt_rating_pct,
        imdb_votes: row.imdb_votes,
        imdb_url: row.imdb_url,
        runtime_min: row.runtime_min,
        showtimes: [],
      };
      byFilm.set(row.film_id, group);
    }
    group.showtimes.push({
      screening_id: row.id,
      start_at_utc: row.start_at_utc,
      cinema_id: row.cinema_id,
      cinema_name: row.cinema_name,
      source_url: row.source_url,
    });
  }

  // Preserve the film order step 1 already decided (soonest-showtime-first)
  // rather than whatever order step 2's flat rows happen to arrive in.
  const items = pageFilmIds.map((id) => byFilm.get(id)).filter(Boolean);

  return { items, total };
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

/** Splits a raw, comma-separated OMDb-style string into trimmed tokens,
 * dropping placeholders like "N/A". Keeps original casing (unlike
 * `films.js`'s own `splitCsvTokens`, which lowercases for similarity
 * scoring) since these values are facet labels meant to be displayed. */
function splitDisplayTokens(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.toUpperCase() !== 'N/A');
}

/**
 * Facet counts for the Film view's filter panel: for every cinema, genre,
 * and language currently represented among active, upcoming screenings,
 * how many distinct films match it. Each count is the number of distinct
 * films, not screenings — a film playing 5 times at one cinema counts
 * once, matching how the filter checkboxes read ("41 films", not "41
 * showtimes").
 *
 * Computed once over the full unfiltered catalog, not recomputed against
 * the caller's current selection — a simpler, static-count model (like the
 * reference this was modeled on appears to use) rather than a live
 * faceted-search recompute. Revisit if that distinction turns out to
 * matter in practice.
 */
export async function getScreeningFacets() {
  const rows = await prisma.screening.findMany({
    where: { is_active: true, start_at_utc: { gte: new Date() } },
    select: {
      film_id: true,
      cinema: { select: { id: true, name: true } },
      film: { select: { genre: true, language: true, year: true, imdb_rating: true, rt_rating_pct: true } },
    },
  });

  const cinemas = new Map(); // cinema_id -> { id, name, filmIds: Set }
  const genres = new Map(); // token -> Set<film_id>
  const languages = new Map(); // token -> Set<film_id>
  const eras = new Map(); // era key -> Set<film_id>
  const seenFilmsForTokens = new Set();
  const imdbRatingByFilm = new Map(); // film_id -> imdb_rating, for the Rating thresholds below
  const rtRatingByFilm = new Map(); // film_id -> rt_rating_pct

  for (const row of rows) {
    const filmId = row.film_id;

    if (row.cinema) {
      let entry = cinemas.get(row.cinema.id);
      if (!entry) {
        entry = { id: row.cinema.id, name: row.cinema.name, filmIds: new Set() };
        cinemas.set(row.cinema.id, entry);
      }
      entry.filmIds.add(filmId);
    }

    // Genre/language/era/rating are per-film, not per-screening — only
    // count each film once regardless of how many screenings/cinemas it
    // has here.
    if (!seenFilmsForTokens.has(filmId)) {
      seenFilmsForTokens.add(filmId);
      for (const g of splitDisplayTokens(row.film?.genre)) {
        if (!genres.has(g)) genres.set(g, new Set());
        genres.get(g).add(filmId);
      }
      for (const l of splitDisplayTokens(row.film?.language)) {
        if (!languages.has(l)) languages.set(l, new Set());
        languages.get(l).add(filmId);
      }
      const era = eraForYear(row.film?.year);
      if (era) {
        if (!eras.has(era)) eras.set(era, new Set());
        eras.get(era).add(filmId);
      }
      if (row.film?.imdb_rating != null) imdbRatingByFilm.set(filmId, row.film.imdb_rating);
      if (row.film?.rt_rating_pct != null) rtRatingByFilm.set(filmId, row.film.rt_rating_pct);
    }
  }

  const toSortedList = (map) =>
    [...map.entries()]
      .map(([name, filmIds]) => ({ name, count: filmIds.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const cinemaList = [...cinemas.values()]
    .map((c) => ({ id: c.id, name: c.name, count: c.filmIds.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Era buckets keep YEAR_ERAS's own chronological order (newest first)
  // rather than being sorted by count like genre/language — "which decade"
  // reads better in time order than ranked by catalog size.
  const eraList = YEAR_ERAS.map((e) => ({
    key: e.key,
    label: e.label,
    count: eras.get(e.key)?.size ?? 0,
  }));

  const countAtOrAbove = (ratingsByFilm, threshold) => {
    let n = 0;
    for (const value of ratingsByFilm.values()) if (value >= threshold) n++;
    return n;
  };

  return {
    cinemas: cinemaList,
    genres: toSortedList(genres),
    languages: toSortedList(languages),
    eras: eraList,
    ratings: {
      imdb: IMDB_RATING_THRESHOLDS.map((threshold) => ({
        threshold,
        count: countAtOrAbove(imdbRatingByFilm, threshold),
      })),
      rt: RT_RATING_THRESHOLDS.map((threshold) => ({
        threshold,
        count: countAtOrAbove(rtRatingByFilm, threshold),
      })),
    },
  };
}
