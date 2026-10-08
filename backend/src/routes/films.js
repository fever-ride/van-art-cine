import { Router } from 'express';
import { getByIdHandler, listHandler } from '../controllers/filmsController.js';
import { getFilmValidator, listFilmsValidator } from '../validators/filmsValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

router.get(
  '/',
  listFilmsValidator,
  handleValidationErrors,
  listHandler,
);

router.get(
  '/:id',
  getFilmValidator,
  handleValidationErrors,
  getByIdHandler,
);

export default router;
