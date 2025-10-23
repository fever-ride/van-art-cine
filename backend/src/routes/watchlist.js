import express from 'express';
import {
  addToWatchlistValidator,
  removeFromWatchlistValidator,
  listWatchlistValidator,
} from '../validators/watchlistValidators.js';
import { handleValidationErrors } from '../utils/validators.js';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/watchlistController.js';

const router = express.Router();

// All watchlist routes require authentication
router.use(requireAuth);

// Add a screening to the watchlist
router.post(
  '/',
  addToWatchlistValidator,
  handleValidationErrors,
  ctrl.addHandler
);

// Remove a screening from the watchlist
router.delete(
  '/:screeningId',
  removeFromWatchlistValidator,
  handleValidationErrors,
  ctrl.removeHandler
);

// List all screenings in the user’s watchlist
router.get(
  '/',
  listWatchlistValidator,
  handleValidationErrors,
  ctrl.listHandler
);

export default router;