// src/routes/bff.js
import { Router } from 'express';
import { composeResponse } from '../services/responder/responder.js';
import { webSerializer, apiSerializer } from '../views/serializers.js';
import { buildContextMix, classifyQuestion } from '../services/retrieval/mixerService.js';
import { cacheLookup } from '../services/cache/answerCacheService.js';
import { persistConversation } from '../services/sql/persistenceService.js';
import { ENV } from '../config/env.js';
import { setTrace } from '../services/debug/traceStore.js';
import { log } from '../utils/log.js';

// NEW: FTS RPC + token helpers (added)
import { searchAssetsFT, searchPlaybooksFT } from '../services/sql/rpcSearch.js';
import { tokensFromQuestion, orQuery } from '../services/retrieval/query/normalize.js';

const router = Router();

// Flag: enable the new FTS retrieval path (assets_v2 + playbooks VIEW)
const USE_FTS =
  String(ENV?.RETRIEVAL_FTS_ENABLED ?? process.env.RETRIEVAL_FTS_ENABLED ?? 'false')
    .toLowerCase() === 'true';

async function handleQuery(req, res, { client = 'web' } = {}) {
  try {
    const {
      question,
      tone,
      namespace,
      topK,
      context,
      references,
      intent: clientIntent,
      debug: debugFlag
    } = req.body || {};
    const requestId = req.id;
    const debug = Boolean(debugFlag || req.query?.debug);

    if (!question || !String(question).trim()) {
      return res.status(400).json({ ok: false, error: 'Missing question' });
    }

    let contextText = '';
    let refs = [];
    let fromCache = false;
    let structured;
    let retrievalMeta = null;
    const retrieval = { assets: 0, playbooks: 0, web: 0, used_cache: false };

    // If explicit context is provided, skip cache & retrieval (unchanged)
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
      // 1) Semantic cache (unchanged)
      const hit = await cacheLookup({ question });
      if (hit.hit && hit.payload?.raw?.text) {
        structured = hit.payload;
        fromCache = true;
        retrieval.used_cache = true;
      } else {
        // ─────────────────────────────────────────────────────────────
        // 2) NEW: FTS retrieval path (flag-guarded; non-destructive)
        // ─────────────────────────────────────────────────────────────
        if (USE_FTS) {
          const tokens = tokensFromQuestion(question);
          const q = orQuery(tokens); // e.g., "gps OR gnss OR chartplotter"
          const limit = typeof topK === 'number' && topK > 0 ? topK : 8;

          try {
            const [assetsFT, playbooksFT] = await Promise.all([
              searchAssetsFT(q, limit).catch(err => {
                log.warn({ err: err?.message }, 'fts.assets.rpc.failed');
                return [];
              }),
              searchPlaybooksFT(q, limit).catch(err => {
                log.warn({ err: err?.message }, 'fts.playbooks.rpc.failed');
                return [];
              })
            ]);

            retrieval.assets = Array.isArray(assetsFT) ? assetsFT.length : 0;
            retrieval.playbooks = Array.isArray(playbooksFT) ? playbooksFT.length : 0;

            // Normalize to references (no content injection — just your data)
            const assetRefs = (assetsFT || []).slice(0, 3).map(r => ({
              id: r.asset_uid ?? null,
              source: 'asset',
              score: Number(r.rank) || 0,
              manufacturer: r.Manufacturer ?? null,
              model: r.model ?? r.Model ?? null,
              description: r.Description ?? null,
              model_key: r.model_key ?? null,
              enrich_model_key: r.enrich_model_key ?? null,
              urls: {
                manual: r.enrich_manual_url ?? null,
                oem: r.enrich_oem_page ?? null
              },
              raw: r
            }));

            const playbookRefs = (playbooksFT || []).slice(0, 3).map(r => ({
              id: r.id ?? null,
              source: 'playbook',
              score: Number(r.rank) || 0,
              title: r.title ?? null,
              category: r.category ?? null,
              model_key: r.model_key ?? null,
              triggers: r.triggers ?? [],
              matchers: r.matchers ?? [],
              urls: {
                manual: r.ref_manual_url ?? null,
                oem: r.ref_oem_page ?? null
              },
              raw: r
            }));

            refs = [...assetRefs, ...playbookRefs].sort((a, b) => b.score - a.score);

            retrievalMeta = {
              mode: 'fts',
              q,
              tokens,
              counts: { assets: retrieval.assets, playbooks: retrieval.playbooks }
            };

            // Compose as usual (schema unchanged)
            structured = await composeResponse({
              question,
              contextText: '',         // evidence-driven; no injected content
              references: refs,
              tone,
              assets: Array.isArray(assetsFT) ? assetsFT : [],
              playbooks: Array.isArray(playbooksFT) ? playbooksFT : [],
              webSnippets: []          // web can still be added by composeResponse/mixer later if needed
            });
          } catch (ftsErr) {
            // If anything in the FTS path fails, fall back to legacy behavior
            log.warn({ err: ftsErr?.message }, 'fts.path.failed.falling.back');
            // continue to legacy path below
            structured = null; // ensure we run legacy branch
          }
        }

        // 3) Legacy retrieval path (unchanged) — runs if FTS is disabled or failed
        if (!structured) {
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
          retrievalMeta = mix.meta || retrievalMeta;
          retrieval.assets = Array.isArray(mix.assets) ? mix.assets.length : retrieval.assets;
          retrieval.playbooks = Array.isArray(mix.playbooks) ? mix.playbooks.length : retrieval.playbooks;
          retrieval.web = Array.isArray(mix.webSnippets) ? mix.webSnippets.length : retrieval.web;

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
    }

    log.info({ requestId, ...retrieval }, 'retrieval');

    // 3) Serialize for client (unchanged)
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

    if (debug) {
      payload._retrieval = retrieval;
    }

    if (fromCache) {
      payload._cache = { hit: true };
    }

    // 4) Background persistence (unchanged)
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

    // 5) Respond (unchanged)
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
