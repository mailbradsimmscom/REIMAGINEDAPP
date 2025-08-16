// src/routes/index.js
import { Router } from 'express';



// new groups
import qaRoutes from './qa.js';
import api from './api.js';
import debug from './debug.js';
import legacy from './legacy.js';
import bff from './bff.js';
import adminRoutes from './admin.js';
import topicsRoutes from './topics.js';
import documentsRoutes from './documents.js';


const router = Router();

// --- legacy/back-compat mounts
router.use('/api', api);
router.use('/bff', bff);
router.use('/debug', debug);
router.use('/legacy', legacy);
router.use('/', legacy);

// --- new clean routes
router.use('/qa', qaRoutes);
router.use('/admin', adminRoutes);
router.use('/topics', topicsRoutes);
router.use('/documents', documentsRoutes);

export default router;
