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
  handleValidationErrors,
} from '../validators/authValidators.js';

import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

/** Public */
router.post('/register', registerValidator, handleValidationErrors, registerHandler);
router.post('/login',    loginValidator,    handleValidationErrors, loginHandler);
router.post('/refresh',  refreshValidator,  handleValidationErrors, refreshHandler);

/** Auth-required */
router.post('/logout',   requireAuth, logoutHandler);

/** Example: who am I */
router.get('/me', requireAuth, meHandler);

export default router;