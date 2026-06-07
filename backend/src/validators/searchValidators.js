import { query } from 'express-validator';

export const searchValidator = [
  query('q')
    .notEmpty()
    .withMessage('q is required')
    .trim()
    .isLength({ max: 500 })
    .withMessage('q must be 500 characters or less'),
  query('date').optional().isISO8601().withMessage('date must be YYYY-MM-DD'),
  query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
  query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
  query('cinema_ids')
    .optional()
    .isString()
    .withMessage('cinema_ids must be a comma-separated string'),
  query('sort')
    .optional()
    .isIn(['relevance', 'time'])
    .withMessage('sort must be relevance or time'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be 1–50')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be >= 0')
    .toInt(),
];
