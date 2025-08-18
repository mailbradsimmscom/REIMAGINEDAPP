// src/services/vector/pineconeAdapter.js
import { Pinecone } from '@pinecone-database/pinecone';

/**
 * Configuration
 */
const INDEX = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME;
const NS    = (process.env.PINECONE_NAMESPACE ?? '').trim();    // production namespace
const WORLD = (process.env.WORLD_NAMESPACE ?? 'world').trim();  // read-only namespace
const DIM   = parseInt(process.env.EMBED_DIM || '3072', 10);    // embedding dimension (hard target)

/**
 * Guardrails
 */
if (!INDEX) throw new Error('Missing PINECONE_INDEX');
if (!NS) throw new Error('PINECONE_NAMESPACE must be set');
if (NS === WORLD || NS === 'world') {
  throw new Error('Refusing to write to "world" namespace.');
}

/**
 * Client factory
 */
function createClient() {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) return null;
  const client = new Pinecone({ apiKey });
  const index = client.index(INDEX);
  return { client, index };
}

/**
 * Public namespace constants
 */
export const PineconeNamespaces = {
  DEFAULT: NS,
  WORLD
};

/**
 * Utilities
 */
function pickText(meta = {}) {
  return meta.text || meta.content || meta.page_content || meta.chunk || meta.body || '';
}

function compileAllowlist(globLike) {
  if (!globLike || globLike === '*') return null;
  const escaped = globLike
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => '^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return new RegExp(escaped.join('|'), 'i');
}

/** Normalize Pinecone filter:
 *  primitive -> { $eq: v }
 *  array     -> { $in: [...] }
 *  object    -> passthrough (assume already has $eq/$in/etc.)
 */
function normalizeFilter(filter) {
  const out = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (v === null || v === undefined) continue;

    if (Array.isArray(v)) {
      out[k] = { $in: v };
      continue;
    }
    if (typeof v === 'object') {
      out[k] = v; // assume caller provided operators
      continue;
    }
    out[k] = { $eq: v };
  }
  return out;
}

function extractDocIdFromFilter(filter) {
  if (!filter) return null;
  const v = filter.docId;
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object' && typeof v.$eq === 'string') return v.$eq;
  return null;
}

/**
 * Dimension / value validation
 */
function assertVectorDim(values, where = 'vector') {
  if (!Array.isArray(values) || values.length !== DIM) {
    throw new Error(
      `Invalid ${where}: expected an array of length ${DIM}, got ${Array.isArray(values) ? values.length : typeof values}`
    );
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`Invalid ${where}: non-finite number at index ${i}`);
    }
  }
}

/**
 * ---- primary API ----
 */
export async function pcQuery({ vector, topK = 5, namespace = NS, filter = {} }) {
  // Enforce 3072-dim query vector
  assertVectorDim(vector, 'query vector');

  const ctx = createClient();
  if (!ctx) return [];
  const idx = ctx.index.namespace(namespace);
  const normalized = normalizeFilter(filter);

  const res = await idx.query({
    vector,
    topK,
    includeMetadata: true,
    includeValues: false,
    filter: normalized
  });

  let matches = (res.matches || []).map((m) => ({
    id: m.id,
    score: m.score,
    source: m.metadata?.source || '',
    text: pickText(m.metadata || {}),
    metadata: m.metadata || {},
    namespace
  }));

  const isWorld = namespace === 'world' || namespace === WORLD;
  if (isWorld) {
    const minScore = parseFloat(process.env.WORLD_INCLUDE_MIN || '0.75');
    const allowlist = compileAllowlist(process.env.WORLD_ALLOWLIST || '*');
    matches = matches.filter((m) => m.score >= minScore);
    if (allowlist) matches = matches.filter((m) => allowlist.test(m.source || ''));
  }
  return matches;
}

export async function upsertVectors(vectors, { namespace = NS } = {}) {
  const ctx = createClient();
  if (!ctx) throw new Error('Pinecone not configured');

  // Validate each vector’s dimension & numeric values
  for (const v of vectors || []) {
    assertVectorDim(v.values, `upsert vector (id=${v.id ?? 'unknown'})`);
  }

  const nsHandle = ctx.index.namespace(namespace);
  await nsHandle.upsert(vectors);
  return { upserted: vectors.length, namespace, dim: DIM };
}

/**
 * Delete by explicit IDs at index-level with explicit namespace.
 */
export async function deleteByIds(ids, { namespace = NS } = {}) {
  const ctx = createClient();
  if (!ctx) throw new Error('Pinecone not configured');
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deleted: false, namespace, mode: 'ids', count: 0 };
  }
  await ctx.index.deleteMany({ ids, namespace });
  return { deleted: true, namespace, mode: 'ids', count: ids.length };
}

/**
 * Delete by filter with fallback:
 * - Try Pinecone filter delete at the *namespace* level (requires field to be filterable)
 * - If server returns "illegal condition for field filter" (or "Invalid filter"), and we have a docId,
 *   fall back to deleting by IDs derived from `${docId}:${i}` for i in [0, MAX)
 */
export async function deleteByFilter(filter, { namespace = NS } = {}) {
  const ctx = createClient();
  if (!ctx) throw new Error('Pinecone not configured');

  const nsHandle = ctx.index.namespace(namespace);
  const normalized = normalizeFilter(filter);

  try {
    // 1) First try filter delete at the *namespace* level
    await nsHandle.deleteMany({ filter: normalized });
    return { deleted: true, namespace, mode: 'filter' };
  } catch (err) {
    const msg = String(err?.message || '');
    const docId = extractDocIdFromFilter(normalized);
    const isIllegal =
      /illegal condition for field filter/i.test(msg) ||
      /invalid filter/i.test(msg);

    // If it's not the filter-schema error or we don't have a docId, bubble up
    if (!isIllegal || !docId) throw err;

    // 2) Fallback: delete by known ID pattern at the *index* level (pass namespace explicitly)
    const MAX = Math.max(1, parseInt(process.env.PINECONE_MAX_CHUNKS_DELETE || '512', 10));
    const ids = Array.from({ length: MAX }, (_, i) => `${docId}:${i}`);

    await ctx.index.deleteMany({ ids, namespace });
    return { deleted: true, namespace, mode: 'ids', count: ids.length };
  }
}

/**
 * ---- back-compat shim (for legacy imports/usage) ----
 */
export async function query(args) { return pcQuery(args); }
export async function upsert(vectors, opts) { return upsertVectors(vectors, opts); }
export async function deleteMany(filter, opts) { return deleteByFilter(filter, opts); }

/**
 * Aggregated export
 */
export const pineconeAdapter = {
  query,
  upsert,
  deleteMany,
  pcQuery,
  upsertVectors,
  deleteByFilter,
  deleteByIds,
  PineconeNamespaces
};

export default {
  pcQuery,
  upsertVectors,
  deleteByFilter,
  deleteByIds,
  query,
  upsert,
  deleteMany,
  PineconeNamespaces
};
