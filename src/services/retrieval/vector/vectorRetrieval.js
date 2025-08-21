// src/services/retrieval/vector/vectorRetrieval.js
import { pineconeAdapter as pinecone } from '../../vector/pineconeAdapter.js';
import * as ai from '../../ai/aiService.js';
import { cleanChunk } from '../utils/textProcessing.js';

/* ---------- Vector utilities ---------- */
function onTopic(hints, text) { 
  const s = String(text || '').toLowerCase(); 
  return hints.some(h => s.includes(h)); 
}

/* ---------- Vector (Pinecone) ---------- */
export async function vectorRetrieve(question, { topK = 8, namespace, hints, aiService = ai, pineconeAdapter = pinecone }) {
  const out = { defaultMatches: [], worldMatches: [] };
  const embedFn =
    aiService.embed ||
    (aiService.aiService && aiService.aiService.embed) ||
    (typeof aiService.default === 'object' && aiService.default.embed) ||
    null;
  if (!embedFn || !pineconeAdapter) return out;

  let vector = null;
  try { vector = await embedFn(question); } catch { return out; }
  if (!Array.isArray(vector) || !vector.length) return out;

  const k = Math.max(3, Math.min(Number(process.env.RETRIEVAL_TOPK) || topK, 20));

  try {
    const def = await pineconeAdapter.query({ vector, topK: k, namespace: namespace || undefined });
    out.defaultMatches = (def || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch { out.defaultMatches = []; }

  try {
    const worldNs = process.env.WORLD_NAMESPACE || 'world';
    const w = await pineconeAdapter.query({ vector, topK: Math.min(k, 5), namespace: worldNs });
    out.worldMatches = (w || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch { out.worldMatches = []; }

  const topical = out.defaultMatches.filter(m => onTopic(hints, m.text));
  topical.sort((a, b) => (b.score || 0) - (a.score || 0));
  out.defaultMatches = topical.slice(0, 8);
  out.worldMatches = out.worldMatches.slice(0, 2);
  return out;
}

export default { vectorRetrieve };