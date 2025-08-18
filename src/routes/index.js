// src/routes/index.js (ESM)
import { Router } from 'express';

// Import modules and normalize whether they export default/router/CommonJS
import * as apiMod from './api.js';
import * as debugMod from './debug.js';
import * as legacyMod from './legacy.js';
import * as bffMod from './bff.js';
import * as qaMod from './qa.js';
import * as adminMod from './admin.js';
import apiRouter from './api.js';
function asRouter(mod, label) {
  const candidate = mod?.default ?? mod?.router ?? mod;
  if (typeof candidate !== 'function') {
    throw new Error(`[routes] ${label} did not export a Router (got: ${typeof candidate})`);
  }
  return candidate;
}

const api = asRouter(apiMod, 'api');
const debug = asRouter(debugMod, 'debug');
const legacy = asRouter(legacyMod, 'legacy');
const bff = asRouter(bffMod, 'bff');
const qa = asRouter(qaMod, 'qa');
const admin = asRouter(adminMod, 'admin');

const router = Router();

// Primary mounts
router.use('/api', api);
router.use('/bff', bff);
router.use('/debug', debug);
router.use('/qa', qa);
router.use('/admin', admin);

// Legacy/back-compat mounts
router.use('/legacy', legacy);
router.use('/', legacy);

export default router;
