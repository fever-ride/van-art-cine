import { Router } from 'express';
import { getByIdHandler } from '../controllers/filmsController.js';

const router = Router();

router.get('/:id', getByIdHandler);

export default router;
