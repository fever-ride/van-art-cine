import { Router } from 'express';
import { searchHandler } from '../controllers/searchController.js';
import { searchValidator } from '../validators/searchValidators.js';
import { handleValidationErrors } from '../utils/validators.js';

const router = Router();

router.get('/', searchValidator, handleValidationErrors, searchHandler);

export default router;
