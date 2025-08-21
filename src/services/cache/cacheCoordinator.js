// src/services/cache/cacheCoordinator.js
// Coordinates cache lookups, FTS retrieval, and legacy retrieval paths

import { composeResponse } from '../responder/responder.js';
import { handleFtsRetrieval } from '../retrieval/ftsCoordinator.js';
import { handleLegacyRetrieval } from '../retrieval/legacyCoordinator.js';
import { cacheLookup } from './answerCacheService.js';
import { log } from '../../utils/log.js';

/**
 * Main cache coordination function that handles the complete cache -> FTS -> legacy retrieval flow
 * @param {Object} params - Request parameters
 * @param {string} params.question - The user question
 * @param {string} params.tone - Response tone
 * @param {string} params.namespace - Vector namespace
 * @param {number} params.topK - Number of results to retrieve
 * @param {string|Array} params.context - Explicit context (skips cache/retrieval)
 * @param {Array} params.references - Explicit references (when context provided)
 * @param {string} params.intent - Client-provided intent
 * @param {string} params.requestId - Request ID for tracing
 * @returns {Object} { structured, fromCache, retrievalMeta, contextText, refs, retrieval }
 */
export async function handleCacheRequest({
  question,
  tone,
  namespace,
  topK,
  context,
  references,
  intent: clientIntent,
  requestId
}) {
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
      const ftsResult = await handleFtsRetrieval({ question, tone, topK, retrieval });
      if (ftsResult) {
        structured = ftsResult.structured;
        retrievalMeta = ftsResult.retrievalMeta;
        refs = ftsResult.refs;
      }

      // 3) Legacy retrieval path — runs if FTS is disabled or failed
      if (!structured) {
        const legacyResult = await handleLegacyRetrieval({
          question,
          tone,
          namespace,
          topK,
          clientIntent,
          requestId,
          retrieval
        });
        
        structured = legacyResult.structured;
        retrievalMeta = legacyResult.retrievalMeta;
        contextText = legacyResult.contextText;
        refs = legacyResult.refs;
      }
    }
  }

  return {
    structured,
    fromCache,
    retrievalMeta,
    contextText,
    refs,
    retrieval
  };
}

export default { handleCacheRequest };