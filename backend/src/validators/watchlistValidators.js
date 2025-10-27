// validators/watchlistValidators.js
import { body, param, query } from 'express-validator';

// Add a screening to the watchlist
export const addToWatchlistValidator = [
  body('screeningId')
    .exists()
    .isInt({ min: 1 })
    .withMessage('screeningId must be a positive integer')
    .toInt(),
];

// Remove a screening from the watchlist
export const removeFromWatchlistValidator = [
  param('screeningId')
    .exists()
    .isInt({ min: 1 })
    .withMessage('screeningId must be a positive integer')
    .toInt(),
];

// List all screenings in the user’s watchlist
export const listWatchlistValidator = [
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
];

// Check if a screening is saved (for GET /status)
export const statusWatchlistValidator = [
  query('screeningId')
    .exists()
    .isInt({ min: 1 })
    .withMessage('screeningId must be a positive integer')
    .toInt(),
];

// Toggle add/remove (for POST /toggle)
export const toggleWatchlistValidator = [
  body('screeningId')
    .exists()
    .isInt({ min: 1 })
    .withMessage('screeningId must be a positive integer')
    .toInt(),
];

// Import guest -> server: body { screeningIds: number[] }
export const importWatchlistValidator = [
  body('screeningIds')
    .exists().withMessage('screeningIds is required')
    .bail()
    .isArray({ min: 1, max: 1000 }).withMessage('screeningIds must be a non-empty array (≤1000)'),
  body('screeningIds.*')
    .isInt({ min: 1 }).withMessage('screeningIds must contain positive integers')
    .toInt(),
];