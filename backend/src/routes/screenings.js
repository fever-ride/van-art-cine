import { Router } from 'express';
import { listHandler, bulkHandler } from '../controllers/screeningsController.js';

const router = Router();

router.get('/',     listHandler);
router.post('/bulk', bulkHandler);

export default router;
