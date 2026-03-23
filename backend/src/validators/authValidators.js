// Validate & sanitize incoming auth payloads.
// Usage example (in routes/auth.js):
//   router.post('/register', registerValidator, handleValidationErrors, ctrl.register)

import { body, cookie, oneOf } from 'express-validator';

/** Shared rules */
const emailRule = body('email')
  .exists().withMessage('Required')
  .bail()
  .isString().withMessage('Must be text')
  .bail()
  .trim()
  .isEmail().withMessage('Must be a valid email address')
  .bail()
  .normalizeEmail();

const passwordRule = body('password')
  .exists().withMessage('Required')
  .bail()
  .isString().withMessage('Must be text')
  .bail()
  .isLength({ min: 8, max: 200 }).withMessage('Must be at least 8 characters');

const optionalNameRule = body('name')
  .optional({ nullable: true })
  .isString().withMessage('Must be text')
  .bail()
  .trim()
  .isLength({ max: 100 }).withMessage('Must be at most 100 characters');

const optionalUA = body('userAgent')
  .optional({ nullable: true })
  .isString().withMessage('userAgent must be a string')
  .bail()
  .isLength({ max: 255 }).withMessage('userAgent too long');

const optionalIP = body('ip')
  .optional({ nullable: true })
  .isString().withMessage('ip must be a string')
  .bail()
  .isLength({ max: 64 }).withMessage('ip too long');

/** Register: email, password, optional name */
export const registerValidator = [
  emailRule,
  passwordRule,
  optionalNameRule,
];

/** Login: email, password (+ optional userAgent/ip you pass through) */
export const loginValidator = [
  emailRule,
  passwordRule,
  optionalUA,
  optionalIP,
];

/**
 * Refresh:
 * Accept refresh token either in body.refreshToken OR cookie 'refresh_token'.
 * oneOf() ensures at least ONE passes.
 */
export const refreshValidator = [
  oneOf([
    body('refreshToken')
      .exists().withMessage('refreshToken is required when not using cookie')
      .bail()
      .isString().withMessage('refreshToken must be a string')
      .bail()
      .isLength({ min: 20 }).withMessage('refreshToken looks too short'),
    cookie('refresh_token')
      .exists().withMessage('refresh_token cookie is required when not using body')
      .bail()
      .isString().withMessage('refresh_token cookie must be a string')
      .bail()
      .isLength({ min: 20 }).withMessage('refresh_token cookie looks too short'),
  ], 'Provide refreshToken in body or refresh_token cookie'),
  optionalUA,
  optionalIP,
];
