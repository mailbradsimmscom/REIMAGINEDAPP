// src/routes/bff.js
import { Router } from 'express';
import { composeResponse } from '../services/responder/responder.js';
import { webSerializer, apiSerializer } from '../views/serializers.js';
import { buildContextMix } from '../services/retrieval/mixerService.js';
import { cacheLookup, cacheStore } from '../services/cache/answerCacheService.js';
import { persistConversation } from '../services/sql/persistenceService.js';

const router = Router();

async function handleQuery(req, res, { client = 'web' } = {}) {
  try {
    const { question, tone, boat_id, namespace, topK, context, references } = req.body || {};
    const requestId = req.id;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ ok: false, error: 'Missing question' });
    }

    let contextText = '';
    let refs = [];
    let mixMeta = null;
    let fromCache = false;
    let structured;

    // If explicit context is provided, skip cache & retrieval
    if (typeof context === 'string' || Array.isArray(context)) {
      contextText = typeof context === 'string' ? context : context.filter(Boolean).join('\n');
      refs = Array.isArray(references) ? references : [];
      structured = await composeResponse({
        question,
        contextText,
        references: refs,
        tone
      });
    } else {
      // 1) Semantic cache
      const hit = await cacheLookup({ question, boatId: boat_id || null });
      if (hit.hit && hit.payload?.raw?.text) {
        structured = hit.payload;
        fromCache = true;
      } else {
        // 2) Retrieval: SQL-first (playbooks + boat knowledge), then vector
        const mix = await buildContextMix({
          question,
          boatId: boat_id || null,
          namespace,
          topK,
          requestId
        });
        contextText = mix.contextText || '';
        refs = Array.isArray(mix.references) ? mix.references : [];
        mixMeta = mix.meta || null;

        structured = await composeResponse({
          question,
          contextText,
          references: refs,
          tone
        });
      }
    }

    // 3) Serialize for client
    let payload = client === 'api' ? apiSerializer(structured) : webSerializer(structured);

    if (process.env.DEBUG_SEARCH === 'true' && client === 'api' && mixMeta) {
      payload._retrieval = mixMeta;
    }
    if (fromCache) {
      payload._cache = { hit: true };
    }

    // 4) Background persistence + cache store (non-blocking)
    (async () => {
      try {
        const topScores = (structured?.raw?.references || [])
          .map(r => r?.score)
          .filter(s => typeof s === 'number')
          .sort((a, b) => b - a)
          .slice(0, 3);

        const confidence = topScores.length
          ? topScores.reduce((a, b) => a + b, 0) / topScores.length
          : null;

        const sourcesUsed = (structured?.raw?.references || []).map(r => ({
          id: r?.id,
          source: r?.source,
          score: r?.score
        }));

        await persistConversation({
          boatId: boat_id || null,
          question,
          answerText: structured?.raw?.text || '',
          confidence,
          sourcesUsed
        });

        if (!fromCache) {
          await cacheStore({
            question,
            boatId: boat_id || null,
            structuredAnswer: structured,
            references: structured?.raw?.references || []
          });
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[persist/cache] error:', e.message);
        }
      }
    })();

    // 5) Respond
    res.json(payload);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// Web BFF (UI default)
router.post('/web/query', async (req, res) => {
  await handleQuery(req, res, { client: 'web' });
});

// iOS BFF (kept for parity; tone is handled in composeResponse/persona)
router.post('/ios/query', async (req, res) => {
  await handleQuery(req, res, { client: 'ios' });
});

// API (verbose; includes optional _retrieval when DEBUG_SEARCH=true)
router.post('/api/query', async (req, res) => {
  await handleQuery(req, res, { client: 'api' });
});

export default router;
