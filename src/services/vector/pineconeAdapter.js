// src/services/vector/pineconeAdapter.js
import { Pinecone } from '@pinecone-database/pinecone';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';
const PINECONE_INDEX = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME || '';
// IMPORTANT: do not force a default namespace string;
// treat undefined/empty as "use SDK default".
const DEFAULT_NS = (process.env.PINECONE_NAMESPACE || '').trim() || undefined;
const WORLD_NS = process.env.WORLD_NAMESPACE || 'world';

const WORLD_INCLUDE_MIN = parseFloat(process.env.WORLD_INCLUDE_MIN || '0.75');
const WORLD_ALLOWLIST = process.env.WORLD_ALLOWLIST || '*';

function compileAllowlist(pattern) {
  if (!pattern || pattern === '*') return null;
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    const body = pattern.slice(1, -1);
    return new RegExp(body, 'i');
  }
  const parts = pattern.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length
    ? new RegExp(`(${parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')
    : null;
}

const allowlistRegex = compileAllowlist(WORLD_ALLOWLIST);

function pickText(meta = {}) {
  return meta.text || meta.content || meta.page_content || meta.chunk || meta.body || '';
}

function pickSource(meta = {}) {
  return meta.source || meta.file || meta.doc_id || meta.url || meta.path || '';
}

function createClient() {
  if (!PINECONE_API_KEY || !PINECONE_INDEX) return null;
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pc.index(PINECONE_INDEX);
  return { pc, index };
}

/**
 * Query Pinecone with a vector; do NOT call .namespace() for default.
 */
export async function pcQuery({
  vector,
  topK = Number(process.env.RETRIEVAL_TOPK || 5),
  namespace,
}) {
  const pcs = createClient();
  if (!pcs) {
    return [
      { id: 'mock-1', score: 0.91, text: 'Mock context A', source: 'mock' },
      { id: 'mock-2', score: 0.84, text: 'Mock context B', source: 'mock' }
    ].slice(0, topK);
  }

  // Resolve namespace: undefined means "use SDK default"
  const ns = (namespace ?? DEFAULT_NS);
  const idx = ns ? pcs.index.namespace(ns) : pcs.index;

  const res = await idx.query({
    topK,
    vector,
    includeMetadata: true
  });

  let matches = (res.matches || []).map(m => ({
    id: m.id,
    score: m.score,
    text: pickText(m.metadata || {}),
    source: pickSource(m.metadata || {})
  })).filter(x => x.text && x.text.trim());

  // world guardrails
  const isWorld = ns === 'world' || ns === WORLD_NS;
  if (isWorld) {
    matches = matches.filter(m => m.score >= WORLD_INCLUDE_MIN);
    if (allowlistRegex) matches = matches.filter(m => allowlistRegex.test(m.source || ''));
  }

  return matches;
}

export const PineconeNamespaces = {
  DEFAULT: DEFAULT_NS, // may be undefined
  WORLD: WORLD_NS
};
