// routes/auth.js
import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
} from '../controllers/authController.js';

import {
  registerValidator,
  loginValidator,
  refreshValidator,
} from '../validators/authValidators.js';

import { handleValidationErrors } from '../utils/validators.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/** Public */
router.post('/register', registerValidator, handleValidationErrors, registerHandler);
router.post('/login',    loginValidator,    handleValidationErrors, loginHandler);
router.post('/refresh',  refreshValidator,  handleValidationErrors, refreshHandler);
// Logout is idempotent and deliberately NOT behind requireAuth: the access
// token lives 15 min, so requiring it made "Sign out" fail silently for
// anyone idle longer than that. It only revokes the refresh token from the
// caller's own cookie and clears cookies — it can't grant anything.
// See TROUBLESHOOTING.md → "Sign out does nothing until refresh".
router.post('/logout',   logoutHandler);

/** Auth-required — who am I */
router.get('/me', requireAuth, meHandler);

export default router;