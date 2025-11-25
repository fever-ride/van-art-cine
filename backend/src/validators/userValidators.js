import { body } from 'express-validator';

export const updateNameValidator = [
  body('name')
    .exists().withMessage('name is required')
    .bail()
    .isString().withMessage('name must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('name must be between 1 and 100 chars'),
];

export const updatePasswordValidator = [
  body('password')
    .exists().withMessage('password is required')
    .bail()
    .isString().withMessage('password must be a string')
    .bail()
    .isLength({ min: 8, max: 200 })
    .withMessage('password must be between 8 and 200 characters'),
];