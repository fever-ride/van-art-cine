// validators/watchlistValidators.js
import { body, param, query } from 'express-validator';

// export only rules here
export const addToWatchlistValidator = [
  body('screeningId').exists().isInt({ min: 1 }).withMessage('screeningId must be a positive integer').toInt(),
];

export const removeFromWatchlistValidator = [
  param('screeningId').exists().isInt({ min: 1 }).withMessage('screeningId must be a positive integer').toInt(),
];

export const listWatchlistValidator = [
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
];