// src/utils/validators.js
import { validationResult } from 'express-validator';

/**
 * Centralized error surfacing for express-validator.
 * Returns 400 with a clean list of { field, msg, location }.
 * 
 * Contract:
 *   error:   stable machine-readable code
 *   message: generic human-readable fallback
 *   details: array for field-level hints (optional for UI)
 */
export function handleValidationErrors(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Some fields are invalid. Please check the form and try again.',
    details: result.array().map(e => ({
      field: e.param,
      msg: e.msg,
      location: e.location,
    })),
  });
}