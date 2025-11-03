// src/models/watchlistModel.js
import { prisma } from '../lib/prismaClient.js';

/**
 * insert, ignoring duplicates thanks to UNIQUE(user_uid, screening_id)
 * Returns: true if newly inserted, false if it already existed
 */
export async function addWatchlistScreening({ userUid, screeningId }) {
  const res = await prisma.watchlist_screening.createMany({
    data: [{ user_uid: userUid, screening_id: Number(screeningId) }],
    skipDuplicates: true, // like INSERT IGNORE
  });
  // createMany returns { count } of actually inserted rows
  return res.count === 1;
}

export async function removeWatchlistScreening({ userUid, screeningId }) {
  const res = await prisma.watchlist_screening.deleteMany({
    where: { user_uid: userUid, screening_id: Number(screeningId) },
  });
  // mimic r.affectedRows > 0
  return res.count > 0;
}

export async function isInWatchlist({ userUid, screeningId }) {
  const row = await prisma.watchlist_screening.findFirst({
    where: { user_uid: userUid, screening_id: Number(screeningId) },
    select: { screening_id: true },
  });
  return !!row;
}

/**
 * Returns rows shaped like the original SQL:
 * - screening_id
 * - start_at_utc, end_at_utc, runtime_min, tz, is_active (as 0/1)
 * - film_id, title, year, imdb_rating, rt_rating_pct
 * - cinema_id, cinema_name
 * - source_url
 * - status  ('missing' | 'inactive' | 'past' | 'upcoming')
 * - is_past (0/1)
 *
 * Notes:
 * - We fetch via relations and compute CASE/order in JS to match the old query.
 * - When includePast === false, we apply the same filters as the SQL WHERE clause.
 */
export async function listWatchlist({
  userUid,
  limit = 100,
  offset = 0,
  includePast = true,
}) {
  const now = new Date();

  // Base query: all watchlist items for the user
  // When includePast=false, mimic:
  //   AND s.id IS NOT NULL AND s.is_active = 1 AND s.start_at_utc >= UTC_TIMESTAMP()
  const where = includePast
    ? { user_uid: userUid }
    : {
        user_uid: userUid,
        screening: {
          // requires screening exists, active, and upcoming
          is: {
            is_active: true,
            start_at_utc: { gte: now },
          },
        },
      };

  const items = await prisma.watchlist_screening.findMany({
    where,
    // We cannot express the original CASE ordering in SQL via Prisma,
    // so we order by time (for stable tie-breaks) and then finalize ordering in JS.
    orderBy: [
      // If screening relation exists, sort by start time; nulls end up together.
      { screening: { start_at_utc: 'asc' } },
    ],
    select: {
      screening_id: true,
      screening: {
        select: {
          id: true,
          start_at_utc: true,
          end_at_utc: true,
          runtime_min: true,
          tz: true,
          is_active: true, // Prisma boolean; we’ll output 0/1 like MySQL did
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
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  // Compute status + is_past and map to the same column names as the SQL
  const mapped = items.map((it) => {
    const s = it.screening; // may be null if missing row (e.g., broken FK)
    const exists = !!s;
    const active = exists ? !!s.is_active : false;
    const start = exists ? s.start_at_utc : null;

    let status;
    if (!exists) status = 'missing';
    else if (!active) status = 'inactive';
    else if (start && start < now) status = 'past';
    else status = 'upcoming';

    const isPast = start ? Number(start < now) : 0;

    return {
      screening_id: it.screening_id,

      // joined data (may be NULL if missing)
      start_at_utc: s?.start_at_utc ?? null,
      end_at_utc: s?.end_at_utc ?? null,
      runtime_min: s?.runtime_min ?? null,
      tz: s?.tz ?? null,
      // keep 0/1 like the original MySQL column
      is_active: exists ? Number(!!s.is_active) : null,

      film_id: s?.film?.id ?? null,
      title: s?.film?.title ?? null,
      year: s?.film?.year ?? null,
      imdb_rating: s?.film?.imdb_rating ?? null,
      rt_rating_pct: s?.film?.rt_rating_pct ?? null,

      cinema_id: s?.cinema?.id ?? null,
      cinema_name: s?.cinema?.name ?? null,

      source_url: s?.source_url ?? null,

      status,              // 'missing' | 'inactive' | 'past' | 'upcoming'
      is_past: isPast,     // 0/1 to match SQL (not boolean)
    };
  });

  // Reproduce the original ORDER BY:
  //   CASE
  //     WHEN s.id IS NULL THEN 3  (missing)
  //     WHEN s.is_active = 0 THEN 2  (inactive)
  //     WHEN s.start_at_utc < NOW() THEN 1  (past)
  //     ELSE 0  (upcoming)
  //   END,
  //   s.start_at_utc ASC
  const priority = (row) => {
    if (row.status === 'upcoming') return 0;
    if (row.status === 'past') return 1;
    if (row.status === 'inactive') return 2;
    return 3; // missing
  };

  mapped.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    const ta = a.start_at_utc ? new Date(a.start_at_utc).getTime() : Infinity;
    const tb = b.start_at_utc ? new Date(b.start_at_utc).getTime() : Infinity;
    return ta - tb;
  });

  // Apply pagination after computing the correct ordering
  const sliced = mapped.slice(Number(offset), Number(offset) + Number(limit));
  return sliced;
}

export async function addManyWatchlistScreenings({ userUid, screeningIds }) {
  if (!screeningIds?.length) return { inserted: 0 };

  const data = screeningIds.map((id) => ({
    user_uid: userUid,
    screening_id: Number(id),
  }));

  const res = await prisma.watchlist_screening.createMany({
    data,
    skipDuplicates: true, // behaves like INSERT IGNORE
  });

  // createMany.count equals number of *newly* inserted rows
  return { inserted: res.count || 0 };
}

export async function countWatchlist({ userUid }) {
  const cnt = await prisma.watchlist_screening.count({
    where: { user_uid: userUid },
  });
  return Number(cnt || 0);
}