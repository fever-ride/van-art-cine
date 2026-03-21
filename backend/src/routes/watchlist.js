import { Router } from 'express';
import {
  addToWatchlistValidator,
  removeFromWatchlistValidator,
  listWatchlistValidator,
  statusWatchlistValidator,
  toggleWatchlistValidator,
  importWatchlistValidator,
} from '../validators/watchlistValidators.js';
import { handleValidationErrors } from '../utils/validators.js';
import { requireAuth } from '../middleware/auth.js';
import {
  listHandler,
  addHandler,
  removeHandler,
  statusHandler,
  toggleHandler,
  importHandler,
} from '../controllers/watchlistController.js';

const router = Router();

router.use(requireAuth);

router.post('/',            addToWatchlistValidator,      handleValidationErrors, addHandler);
router.delete('/:screeningId', removeFromWatchlistValidator, handleValidationErrors, removeHandler);
router.get('/',             listWatchlistValidator,       handleValidationErrors, listHandler);
router.get('/status',       statusWatchlistValidator,     handleValidationErrors, statusHandler);
router.post('/toggle',      toggleWatchlistValidator,     handleValidationErrors, toggleHandler);
router.post('/import',      importWatchlistValidator,     handleValidationErrors, importHandler);

export default router;
