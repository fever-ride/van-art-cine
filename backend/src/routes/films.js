import { Router } from 'express';
import { getByIdHandler } from '../controllers/filmsController.js';
import { getFilmValidator } from '../validators/filmsValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

router.get(
  '/:id',
  getFilmValidator,
  handleValidationErrors,
  getByIdHandler,
);

export default router;
