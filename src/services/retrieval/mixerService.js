// src/services/retrieval/mixerService.js
// Main orchestrator for retrieval pipeline coordination

import { pineconeAdapter as pinecone } from '../vector/pineconeAdapter.js';
import * as ai from '../ai/aiService.js';
import {
  searchPlaybooks,
  formatPlaybookBlock,
  derivePlaybookKeywords
} from '../sql/playbookService.js';
import { searchAssets } from '../sql/assetService.js';
import {
  buildWorldQueries,
  serpapiSearch,
  filterAndRank
} from '../world/serpapiService.js';
import { fetchAndChunk } from '../fetch/fetchAndChunk.js';

// Extracted services
import { classifyQuestion } from './intent/intentClassifier.js';
import { cleanChunk, escapeRegex, scoreChunkByHints } from './utils/textProcessing.js';
import { dedupById, capContext } from './utils/contextUtils.js';
import { vectorRetrieve } from './vector/vectorRetrieval.js';
import { vectorSearch } from './vector/vectorSearch.js';
import { assetSearch } from './sources/assetSearch.js';
import { playbookSearch } from './sources/playbookSearch.js';
import { worldSearch } from './sources/worldSearch.js';
import retrievalConfig from './retrievalConfig.json' with { type: 'json' };


/* ---------- Orchestrator ---------- */

/**
 * Main retrieval orchestrator - coordinates all search services
 * and assembles the final context mix for AI generation
 */
export async function buildContextMix({
  question, namespace, topK = 8, requestId, intent = 'generic'
}, {
  // Service dependencies (for testing/customization)
  searchPlaybooks: searchPB = searchPlaybooks,
  searchAssets: searchAS = searchAssets,
  formatPlaybookBlock: formatPB = formatPlaybookBlock,
  derivePlaybookKeywords: deriveKW = derivePlaybookKeywords,
  buildWorldQueries: buildWQ = buildWorldQueries,
  serpapiSearch: serpSearch = serpapiSearch,
  filterAndRank: filterRank = filterAndRank,
  fetchAndChunk: fetchChunk = fetchAndChunk,
  aiService: aiSvc = ai,
  pineconeAdapter: pineconeSvc = pinecone
} = {}) {
  // Initialize shared state
  const meta = {
    requestId,
    playbook_hit: false,
    sql_rows: 0,
    sql_selected: 0,
    asset_rows: 0,
    asset_selected: 0,
    vec_default_matches: 0,
    vec_world_matches: 0,
    pruned_default: 0,
    pruned_world: 0,
    failures: [],
    allow_domains: [],
    router_keywords: []
  };

  const hints = deriveKW(question);
  const parts = [];
  const refs = [];
  const assets = [];
  const playbooks = [];
  const webSnippets = [];

  // Define coordinated search steps
  const steps = {
    async assetSearch() {
      await assetSearch({ hints, parts, refs, assets, meta, searchAS });
    },

    async playbookSearch() {
      await playbookSearch({ question, hints, playbooks, refs, meta, searchPB, formatPB, deriveKW });
    },

    async vectorSearch() {
      await vectorSearch({ question, topK, namespace, hints, parts, refs, meta, aiService: aiSvc, pineconeAdapter: pineconeSvc });
    },

    async worldSearch() {
      await worldSearch({ parts, refs, meta, webSnippets, buildWQ, serpSearch, filterRank, fetchChunk });
    }
  };

  // Execute configured retrieval plan
  const plan = retrievalConfig[intent] || retrievalConfig.default || Object.keys(steps);
  for (const step of plan) {
    const fn = steps[step];
    if (typeof fn === 'function') await fn();
  }

  // Assemble final response
  const references = dedupById(refs);
  const contextText = capContext(cleanChunk(parts.join('\n\n')), 6000);
  return { contextText, references, meta, assets, playbooks, webSnippets };
}

export default { buildContextMix };

// Re-export functions for backward compatibility
export { classifyQuestion };
export { cleanChunk, escapeRegex, scoreChunkByHints };
export { dedupById, capContext };
export { vectorRetrieve };
export { vectorSearch };
export { assetSearch };
export { playbookSearch };
export { worldSearch };
