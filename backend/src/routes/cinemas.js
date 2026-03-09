import { Router } from 'express';
import { listCinemas } from '../models/cinemas.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const items = await listCinemas();
    res.json({ items });
  } catch (err) { return next(err); }
});

export default router;