// src/routes/bff.js
import { Router } from 'express';
import { validateAndExtractParams } from '../services/routing/requestHandler.js';
import { handleCacheRequest } from '../services/cache/cacheCoordinator.js';
import { serializeResponse } from '../services/serialization/responseSerializer.js';
import { recordTelemetry } from '../services/telemetry/retrievalTelemetry.js';
import { log } from '../utils/log.js';

const router = Router();

async function handleQuery(req, res, next, { client = 'web' } = {}) {
  try {
    // 1) Validate and extract request parameters
    const {
      question,
      tone,
      namespace,
      topK,
      context,
      references,
      clientIntent,
      requestId,
      debug
    } = validateAndExtractParams(req);

    // 2) Handle cache lookup, FTS retrieval, and legacy retrieval coordination
    const {
      structured,
      fromCache,
      retrievalMeta,
      contextText,
      refs,
      retrieval
    } = await handleCacheRequest({
      question,
      tone,
      namespace,
      topK,
      context,
      references,
      intent: clientIntent,
      requestId
    });

    log.info({ requestId, ...retrieval }, 'retrieval');

    // 3) Serialize response for client
    const payload = serializeResponse({
      structured,
      client,
      retrievalMeta,
      retrieval,
      debug,
      fromCache,
      requestId,
      question
    });

    // 4) Record telemetry in background
    recordTelemetry({ question, structured });

    // 5) Respond (unchanged)
    res.json(payload);
  } catch (err) {
    // Let the error middleware handle all errors
    next(err);
  }
}

// Web BFF (UI default)
router.post('/web/query', async (req, res, next) => {
  await handleQuery(req, res, next, { client: 'web' });
});

// iOS BFF (kept for parity; tone is handled in composeResponse/persona)
router.post('/ios/query', async (req, res, next) => {
  await handleQuery(req, res, next, { client: 'ios' });
});

// API (verbose)
router.post('/api/query', async (req, res, next) => {
  await handleQuery(req, res, next, { client: 'api' });
});

export default router;
