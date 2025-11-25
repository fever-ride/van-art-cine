import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getMyProfile,
  updateMyName,
  updateMyPassword,
  deleteMyAccount,
} from '../controllers/userController.js';
import { updateNameValidator, updatePasswordValidator } from '../validators/userValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

// get profile
router.get('/me', requireAuth, getMyProfile);

// update name
router.patch(
  '/me',
  requireAuth,
  updateNameValidator,
  handleValidationErrors,
  updateMyName,
);

// update password
router.patch(
  '/me/password', 
  requireAuth, 
  updatePasswordValidator, 
  handleValidationErrors,
  updateMyPassword
);

// delete account
router.delete('/me', requireAuth, deleteMyAccount);

export default router;