import { param, query } from 'express-validator';

export const getFilmValidator = [
  param('id')
    .isInt({ min: 1 }).withMessage('id must be a positive integer')
    .toInt(),
];

export const listFilmsValidator = [
  query('date').optional().isISO8601().withMessage('date must be YYYY-MM-DD'),
  query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
  query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
  query('cinema_ids')
    .optional()
    .isString()
    .withMessage('cinema_ids must be a comma-separated string'),
  query('q').optional().isString().trim(),
  query('genre')
    .optional()
    .isString()
    .withMessage('genre must be a comma-separated string'),
  query('language')
    .optional()
    .isString()
    .withMessage('language must be a comma-separated string'),
  query('era')
    .optional()
    .isString()
    .withMessage('era must be a comma-separated string'),
  query('min_imdb')
    .optional()
    .isFloat({ min: 0, max: 10 })
    .withMessage('min_imdb must be 0–10')
    .toFloat(),
  query('min_rt')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('min_rt must be 0–100')
    .toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100').toInt(),
  query('offset').optional().isInt({ min: 0 }).withMessage('offset must be ≥ 0').toInt(),
];
