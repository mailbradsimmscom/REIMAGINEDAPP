// src/services/vector/pineconeAdapter.js (ESM)
import { Pinecone } from '@pinecone-database/pinecone';

function createClient() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME;
  if (!apiKey || !indexName) return null;

  const client = new Pinecone({ apiKey });
  const index = client.index(indexName);
  return { client, index };
}

function pickText(meta = {}) {
  return meta.text || meta.content || meta.page_content || meta.chunk || meta.body || '';
}

function pickSource(meta = {}) {
  return meta.source || meta.file || meta.doc_id || meta.url || meta.path || '';
}

function compileAllowlist(pattern) {
  if (!pattern || pattern === '*') return null; // allow everything
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    const body = pattern.slice(1, -1);
    return new RegExp(body, 'i');
  }
  const parts = pattern.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length
    ? new RegExp(`(${parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')
    : null;
}

/**
 * Query Pinecone for nearest chunks.
 * - Applies "world" namespace guardrails (min score + allowlist) when ns === "world".
 * - If no client or index is configured, returns a small mock set (dev-friendly).
 */
async function query({ vector, topK = 5, namespace = process.env.PINECONE_NAMESPACE || undefined }) {
  const pcs = createClient();
  if (!pcs) {
    return [
      { id: 'mock-1', score: 0.91, text: 'Mock context A', source: 'mock' },
      { id: 'mock-2', score: 0.84, text: 'Mock context B', source: 'mock' }
    ].slice(0, topK);
  }

  const res = await pcs.index.namespace(namespace).query({
    topK,
    vector,
    includeMetadata: true
  });

  let matches = (res.matches || [])
    .map(m => ({
      id: m.id,
      score: m.score,
      text: pickText(m.metadata || {}),
      source: pickSource(m.metadata || {})
    }))
    .filter(x => x.text && x.text.trim());

  // World namespace guardrails
  const isWorld = namespace === 'world' || process.env.WORLD_NAMESPACE === namespace;
  if (isWorld) {
    const minScore = parseFloat(process.env.WORLD_INCLUDE_MIN || '0.75');
    const allowlist = compileAllowlist(process.env.WORLD_ALLOWLIST || '*');
    matches = matches.filter(m => m.score >= minScore);
    if (allowlist) matches = matches.filter(m => allowlist.test(m.source || ''));
  }

  return matches;
}

export const pineconeAdapter = { query };
export default pineconeAdapter;
