import { pool } from '../db.js';

// insert, ignoring duplicates thanks to UNIQUE(user_uid, screening_id)
export async function addWatchlistScreening({ userUid, screeningId }) {
  const sql = `
    INSERT IGNORE INTO watchlist_screening (user_uid, screening_id)
    VALUES (?, ?)
  `;
  const [r] = await pool.query(sql, [userUid, screeningId]);
  // r.affectedRows === 1 means newly inserted; 0 means it already existed
  return r.affectedRows === 1;
}

export async function removeWatchlistScreening({ userUid, screeningId }) {
  const sql = `
    DELETE FROM watchlist_screening
    WHERE user_uid = ? AND screening_id = ?
  `;
  const [r] = await pool.query(sql, [userUid, screeningId]);
  return r.affectedRows > 0;
}

export async function isInWatchlist({ userUid, screeningId }) {
  const sql = `
    SELECT 1 FROM watchlist_screening
    WHERE user_uid = ? AND screening_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userUid, screeningId]);
  return rows.length > 0;
}

export async function listWatchlist({ userUid, limit = 100, offset = 0, includePast = true }) {
  const sql = `
    SELECT
      w.screening_id,

      -- joined data (may be NULL if missing)
      s.start_at_utc, s.end_at_utc, s.runtime_min, s.tz, s.is_active,
      f.id AS film_id, f.title, f.year, f.imdb_rating, f.rt_rating_pct,
      c.id AS cinema_id, c.name AS cinema_name,
      s.source_url,

      -- compute status
      CASE
        WHEN s.id IS NULL THEN 'missing'           -- screening record no longer exists
        WHEN s.is_active = 0 THEN 'inactive'       -- exists but we marked it inactive
        WHEN s.start_at_utc < UTC_TIMESTAMP() THEN 'past'
        ELSE 'upcoming'
      END AS status,

      -- convenience boolean
      (s.start_at_utc < UTC_TIMESTAMP()) AS is_past
    FROM watchlist_screening w
    LEFT JOIN screening s ON s.id = w.screening_id
    LEFT JOIN film f      ON f.id = s.film_id
    LEFT JOIN cinema c    ON c.id = s.cinema_id
    WHERE w.user_uid = ?
      ${includePast
        ? '' 
        : 'AND s.id IS NOT NULL AND s.is_active = 1 AND s.start_at_utc >= UTC_TIMESTAMP()'}
    ORDER BY
      -- upcoming first, then past, then inactive/missing, then by time
      CASE
        WHEN s.id IS NULL THEN 3
        WHEN s.is_active = 0 THEN 2
        WHEN s.start_at_utc < UTC_TIMESTAMP() THEN 1
        ELSE 0
      END,
      s.start_at_utc ASC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(sql, [userUid, limit, offset]);
  return rows;
}

export async function addManyWatchlistScreenings({ userUid, screeningIds }) {
  if (!screeningIds?.length) return { inserted: 0 };
  const placeholders = screeningIds.map(() => '(?, ?)').join(', ');
  const params = screeningIds.flatMap(id => [userUid, id]);
  const sql = `
    INSERT IGNORE INTO watchlist_screening (user_uid, screening_id)
    VALUES ${placeholders}
  `;
  const [r] = await pool.query(sql, params);
  // affectedRows counts only new rows when using INSERT IGNORE
  return { inserted: r.affectedRows || 0 };
}

export async function countWatchlist({ userUid }) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM watchlist_screening WHERE user_uid = ?`,
    [userUid]
  );
  return Number(rows[0]?.cnt || 0);
}