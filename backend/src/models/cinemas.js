import { pool } from '../db.js';

export async function listCinemas() {
  const [rows] = await pool.query(
    `SELECT id, name
     FROM cinema
     WHERE name IS NOT NULL AND TRIM(name) <> ''
     ORDER BY name ASC`
  );
  return rows;
}