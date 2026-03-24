import { Router } from 'express';
import { listHandler, bulkHandler } from '../controllers/screeningsController.js';
import { listScreeningsValidator, bulkScreeningsValidator } from '../validators/screeningsValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

router.get(
  '/',
  listScreeningsValidator,
  handleValidationErrors,
  listHandler,
);
router.post(
  '/bulk',
  bulkScreeningsValidator,
  handleValidationErrors,
  bulkHandler,
);

export default router;
