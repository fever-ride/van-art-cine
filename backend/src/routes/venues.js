import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT v.id, v.name, v.address, c.id AS cinema_id, c.name AS cinema_name
         FROM venue v JOIN cinema c ON c.id = v.cinema_id
        ORDER BY c.name, v.name`
    );
    res.json({ items: rows });
  } catch (e) { next(e); }
});

export default router;