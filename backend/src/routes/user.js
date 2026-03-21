import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  profileHandler,
  updateNameHandler,
  updatePasswordHandler,
  deleteAccountHandler,
} from '../controllers/userController.js';
import { updateNameValidator, updatePasswordValidator } from '../validators/userValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

router.get('/me', requireAuth, profileHandler);

router.patch(
  '/me',
  requireAuth,
  updateNameValidator,
  handleValidationErrors,
  updateNameHandler,
);

router.patch(
  '/me/password',
  requireAuth,
  updatePasswordValidator,
  handleValidationErrors,
  updatePasswordHandler,
);

router.delete('/me', requireAuth, deleteAccountHandler);

export default router;
