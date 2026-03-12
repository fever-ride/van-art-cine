import { query, body } from 'express-validator';

const ALLOWED_SORTS  = ['time', 'title'];
const ALLOWED_ORDERS = ['asc', 'desc'];

export const listScreeningsValidator = [
  query('date').optional().isISO8601().withMessage('date must be YYYY-MM-DD'),
  query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
  query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
  query('cinema_ids')
    .optional()
    .isString()
    .withMessage('cinema_ids must be a comma-separated string'),
  query('film_id').optional().isInt({ min: 1 }).withMessage('film_id must be a positive integer').toInt(),
  query('q').optional().isString().trim(),
  query('sort')
    .optional()
    .isIn(ALLOWED_SORTS)
    .withMessage(`sort must be one of: ${ALLOWED_SORTS.join(', ')}`),
  query('order')
    .optional()
    .isIn(ALLOWED_ORDERS)
    .withMessage(`order must be one of: ${ALLOWED_ORDERS.join(', ')}`),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1–200').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0').toInt(),
];

export const bulkScreeningsValidator = [
  body('ids')
    .exists().withMessage('ids is required')
    .bail()
    .isArray({ min: 1, max: 500 }).withMessage('ids must be a non-empty array (≤500)'),
  body('ids.*')
    .isInt({ min: 1 }).withMessage('each id must be a positive integer')
    .toInt(),
];
