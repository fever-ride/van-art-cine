// src/utils/validators.js
import { validationResult } from 'express-validator';

/**
 * Centralized error surfacing for express-validator.
 * Returns 400 with a clean list of { field, msg, location }.
 */
export function handleValidationErrors(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    details: result.array().map(e => ({
      field: e.param,
      msg: e.msg,
      location: e.location,
    })),
  });
}