// src/routes/bff.js
import { Router } from 'express';
import { composeResponse } from '../services/responder/responder.js';
import { webSerializer, apiSerializer } from '../views/serializers.js';
import { buildContextMix, classifyQuestion } from '../services/retrieval/mixerService.js';
import { cacheLookup } from '../services/cache/answerCacheService.js';
import { persistConversation } from '../services/sql/persistenceService.js';
import { ENV } from '../config/env.js';
import { setTrace } from '../services/debug/traceStore.js';

const router = Router();

async function handleQuery(req, res, { client = 'web' } = {}) {
  try {
    const {
      question,
      tone,
      namespace,
      topK,
      context,
      references,
      intent: clientIntent
    } = req.body || {};
    const requestId = req.id;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ ok: false, error: 'Missing question' });
    }

    let contextText = '';
    let refs = [];
    let fromCache = false;
    let structured;
    let retrievalMeta = null;

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
      const hit = await cacheLookup({ question });
      if (hit.hit && hit.payload?.raw?.text) {
        structured = hit.payload;
        fromCache = true;
      } else {
        // 2) Retrieval: SQL-first (playbooks + boat knowledge), then vector
        const intent = clientIntent || await classifyQuestion(question);
        const mix = await buildContextMix({
          question,
          namespace,
          topK,
          requestId,
          intent
        });
        contextText = mix.contextText || '';
        refs = Array.isArray(mix.references) ? mix.references : [];
        retrievalMeta = mix.meta || null;

        structured = await composeResponse({
          question,
          contextText,
          references: refs,
          tone,
          assets: Array.isArray(mix.assets) ? mix.assets : [],
          playbooks: Array.isArray(mix.playbooks) ? mix.playbooks : [],
          webSnippets: Array.isArray(mix.webSnippets) ? mix.webSnippets : []
        });
      }
    }

    // 3) Serialize for client
    let payload = client === 'api'
      ? apiSerializer(structured)
      : (() => {
          const out = webSerializer(structured);
          out._structured = structured;
          return out;
        })();

    if (retrievalMeta && ENV.RETRIEVAL_TELEMETRY_ENABLED) {
      setTrace(requestId, { question, meta: retrievalMeta });
      payload._retrievalMeta = retrievalMeta;
    }

    if (fromCache) {
      payload._cache = { hit: true };
    }

    // 4) Background persistence (non-blocking)
    if (ENV.RETRIEVAL_TELEMETRY_ENABLED) {
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
            question,
            answerText: structured?.raw?.text || '',
            confidence,
            sourcesUsed
          });
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[persist/cache] error:', e.message);
          }
        }
      })();
    }

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

// API (verbose)
router.post('/api/query', async (req, res) => {
  await handleQuery(req, res, { client: 'api' });
});

export default router;
