// src/services/retrieval/vector/vectorSearch.js
import { ENV } from '../../../config/env.js';
import { vectorRetrieve } from './vectorRetrieval.js';
import { scoreChunkByHints } from '../utils/textProcessing.js';
import { derivePlaybookKeywords } from '../../sql/playbookService.js';

/* ---------- Re-ranking ---------- */
function reRankAndPrune(matches, { keep = 4, question }) {
  if (!Array.isArray(matches) || !matches.length) return [];
  const hints = derivePlaybookKeywords(question);
  const scored = matches
    .map(m => ({ ...m, _scoreLocal: scoreChunkByHints(m.text || '', hints) }))
    .filter(m => m._scoreLocal > 0)
    .sort((a, b) => ((b.score || 0) - (a.score || 0)) || ((b._scoreLocal || 0) - (a._scoreLocal || 0)));
  const seen = new Set();
  const out = [];
  for (const m of scored) {
    const key = m.id || (m.text || '').slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= keep) break;
  }
  return out;
}

/**
 * Vector search step for buildContextMix pipeline
 * Handles vector retrieval, re-ranking, and result processing
 */
export async function vectorSearch({
  question,
  topK,
  namespace,
  hints,
  parts,
  refs,
  meta,
  aiService,
  pineconeAdapter
} = {}) {
  if (!ENV.RETRIEVAL_VECTOR_ENABLED) return;
  
  let defaultMatches = [];
  let worldMatches = [];
  
  try {
    const res = await vectorRetrieve(question, { topK, namespace, hints, aiService, pineconeAdapter });
    defaultMatches = res.defaultMatches || [];
    worldMatches = res.worldMatches || [];
    meta.vec_default_matches = defaultMatches.length;
    meta.vec_world_matches = worldMatches.length;
  } catch (e) { 
    meta.failures.push(`vector:${e.message}`); 
  }

  const prunedDefault = reRankAndPrune(defaultMatches, { keep: 3, question });
  const prunedWorld = reRankAndPrune(worldMatches, { keep: 1, question });
  meta.pruned_default = prunedDefault.length;
  meta.pruned_world = prunedWorld.length;

  for (const m of prunedDefault) {
    parts.push(m.text);
    refs.push({ id: m.id, source: m.source || 'default', score: m.score });
  }
  for (const m of prunedWorld) {
    parts.push(m.text);
    refs.push({ id: m.id, source: m.source || 'world', score: m.score });
  }
}

export default { vectorSearch };