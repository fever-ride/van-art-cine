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

// List with some joined info for display
export async function listWatchlist({ userUid, limit = 100, offset = 0 }) {
    const sql = `
    SELECT
      w.screening_id,
      s.start_at_utc, s.end_at_utc, s.runtime_min, s.tz,
      f.id AS film_id, f.title, f.year, f.imdb_rating, f.rt_rating_pct,
      c.id AS cinema_id, c.name AS cinema_name,
      s.source_url
    FROM watchlist_screening w
    JOIN screening s ON s.id = w.screening_id AND s.is_active = 1
    JOIN film f      ON f.id = s.film_id
    JOIN cinema c    ON c.id = s.cinema_id
    WHERE w.user_uid = ?
    ORDER BY s.start_at_utc ASC
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