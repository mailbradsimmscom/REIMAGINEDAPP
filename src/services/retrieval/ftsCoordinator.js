// src/services/retrieval/ftsCoordinator.js
// Coordinates Full Text Search (FTS) retrieval using Supabase RPC calls

import { composeResponse } from '../responder/responder.js';
import { config } from '../../config/index.js';
import { log } from '../../utils/log.js';

// FTS RPC + token helpers
import { searchAssetsFT, searchPlaybooksFT } from '../sql/rpcSearch.js';
import { tokensFromQuestion, orQuery } from './query/normalize.js';

// Flag: enable the new FTS retrieval path (assets_v2 + playbooks VIEW)
const USE_FTS = config.RETRIEVAL_FTS_ENABLED;

/**
 * Handle FTS retrieval path using Supabase full-text search
 * @param {Object} params - Request parameters
 * @param {string} params.question - The user question
 * @param {string} params.tone - Response tone
 * @param {number} params.topK - Number of results to retrieve
 * @param {Object} params.retrieval - Retrieval metrics object to update
 * @returns {Object|null} { structured, retrievalMeta, refs } or null if disabled/failed
 */
export async function handleFtsRetrieval({ question, tone, topK, retrieval }) {
  // Check if FTS is enabled
  if (!USE_FTS) {
    return null;
  }

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

    const refs = [...assetRefs, ...playbookRefs].sort((a, b) => b.score - a.score);

    const retrievalMeta = {
      mode: 'fts',
      q,
      tokens,
      counts: { assets: retrieval.assets, playbooks: retrieval.playbooks }
    };

    // Compose as usual (schema unchanged)
    const structured = await composeResponse({
      question,
      contextText: '',         // evidence-driven; no injected content
      references: refs,
      tone,
      assets: Array.isArray(assetsFT) ? assetsFT : [],
      playbooks: Array.isArray(playbooksFT) ? playbooksFT : [],
      webSnippets: []          // web can still be added by composeResponse/mixer later if needed
    });

    return {
      structured,
      retrievalMeta,
      refs
    };
  } catch (ftsErr) {
    // If anything in the FTS path fails, fall back to legacy behavior
    log.warn({ err: ftsErr?.message }, 'fts.path.failed.falling.back');
    return null; // caller should proceed with legacy path
  }
}

export default { handleFtsRetrieval };