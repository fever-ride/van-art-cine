import { Router } from 'express';
import { listHandler, bulkHandler, facetsHandler } from '../controllers/screeningsController.js';
import { listScreeningsValidator, bulkScreeningsValidator } from '../validators/screeningsValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

router.get(
  '/',
  listScreeningsValidator,
  handleValidationErrors,
  listHandler,
);
router.get('/facets', facetsHandler);
router.post(
  '/bulk',
  bulkScreeningsValidator,
  handleValidationErrors,
  bulkHandler,
);

export default router;
