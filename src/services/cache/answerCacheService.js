// src/services/cache/answerCacheService.js
// Semantic cache for answers using OpenAI embeddings + cosine similarity.
// Compatible with existing Supabase schema: answers_cache(intent_key, boat_profile_id, answer_text, evidence_ids, expires_at)

import { supabase } from '../../config/supabase.js';
import { embedOne } from '../ai/openaiAdapter.js';

// --------- ENV & utils
const SIM_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD || 0.86);
const CACHE_TTL_MIN = Number(process.env.CACHE_TTL_MINUTES || 180); // 3h default
const CACHE_SCAN_LIMIT = Number(process.env.CACHE_SCAN_LIMIT || 50);
const EMBED_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';

function nowIso() {
  return new Date().toISOString();
}
function addMinutes(dateIso, minutes) {
  const d = new Date(dateIso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

// Cosine similarity for two numeric arrays
function cosine(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 64-bit SimHash (sign random projections over embedding) for LSH-like bucketing
// We use a stable seeded pseudo-random basis derived from the index; here we fake a simple deterministic pattern.
function simhash64(vec = []) {
  const BITS = 64;
  const acc = new Array(BITS).fill(0);
  // Simple, deterministic "random" weights per dimension-bit to avoid extra deps.
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i];
    // fold i into 64 "hash lanes"
    for (let b = 0; b < BITS; b++) {
      const sign = ((i * 1315423911) ^ (b * 2654435761)) & 1 ? 1 : -1;
      acc[b] += v * sign;
    }
  }
  // produce 64-bit hex string
  let hi = 0n, lo = 0n;
  for (let b = 0; b < BITS; b++) {
    const bit = acc[b] >= 0 ? 1n : 0n;
    if (b < 32) {
      hi = (hi << 1n) | bit;
    } else {
      lo = (lo << 1n) | bit;
    }
  }
  const hiHex = hi.toString(16).padStart(8, '0');
  const loHex = lo.toString(16).padStart(8, '0');
  return `${hiHex}${loHex}`;
}

// Build an intent_key that buckets by model + boat + simhash
function makeIntentKey({ model, boatId, simhash }) {
  // Keep it short & filterable
  return `sem:${model}:${boatId || 'none'}:${simhash}`;
}

// Parse JSON in answer_text safely
function safeParse(jsonText) {
  try { return JSON.parse(jsonText); } catch { return null; }
}

// --------- Public API

/**
 * Try to hit the cache semantically.
 * 1) Embed the incoming question
 * 2) Compute simhash and query recent entries in that bucket (same boat + model)
 * 3) Recompute cosine against stored embeddings (kept inside answer_text JSON)
 * Returns { hit: true, payload, evidence_ids } on success; otherwise { hit: false }
 */
export async function cacheLookup({ question, boatId }) {
  if (!supabase || !question) return { hit: false, reason: 'no_supabase_or_question' };

  const qEmbed = await embedOne(question);
  if (!qEmbed?.length) return { hit: false, reason: 'no_embedding' };

  const bucket = makeIntentKey({ model: EMBED_MODEL, boatId, simhash: simhash64(qEmbed) });

  // Fetch recent entries for this exact bucket
  const { data, error } = await supabase
    .from('answers_cache')
    .select('id, intent_key, boat_profile_id, answer_text, evidence_ids, expires_at, created_at')
    .eq('intent_key', bucket)
    .order('created_at', { ascending: false })
    .limit(CACHE_SCAN_LIMIT);

  if (error) return { hit: false, reason: 'supabase_error:' + error.message };

  const now = Date.now();
  for (const row of data || []) {
    // TTL check
    if (row.expires_at && new Date(row.expires_at).getTime() < now) continue;

    const payload = safeParse(row.answer_text);
    const storedEmbed = payload?.questionEmbedding;
    if (!Array.isArray(storedEmbed) || storedEmbed.length !== qEmbed.length) continue;

    const sim = cosine(qEmbed, storedEmbed);
    if (sim >= SIM_THRESHOLD) {
      return {
        hit: true,
        payload, // structured answer we stored
        evidence_ids: Array.isArray(row.evidence_ids) ? row.evidence_ids : [],
        meta: { cache_id: row.id, similarity: sim, bucket }
      };
    }
  }

  return { hit: false, reason: 'no_match' };
}

/**
 * Save answer in cache with semantic metadata. Non-blocking: errors are returned but callers can ignore.
 * We store:
 *  - intent_key: sem:<model>:<boatId>:<simhash64>
 *  - answer_text: JSON.stringify({ question, questionEmbedding, structuredAnswer, references })
 *  - evidence_ids: mapped from references ids
 */
export async function cacheStore({ question, boatId, structuredAnswer, references }) {
  if (!supabase || !question || !structuredAnswer) return { ok: false, reason: 'missing_input' };

  const qEmbed = await embedOne(question);
  if (!qEmbed?.length) return { ok: false, reason: 'no_embedding' };

  const bucket = makeIntentKey({ model: EMBED_MODEL, boatId, simhash: simhash64(qEmbed) });
  const createdAt = nowIso();
  const expiresAt = addMinutes(createdAt, CACHE_TTL_MIN);

  const payload = {
    model: EMBED_MODEL,
    question,
    questionEmbedding: qEmbed,
    structuredAnswer,
    references: references || []
  };

  const evidence_ids = Array.isArray(references)
    ? references.map(r => r?.id).filter(Boolean)
    : [];

  const { error } = await supabase
    .from('answers_cache')
    .insert([{
      intent_key: bucket,
      boat_profile_id: boatId || null, // schema uses boat_profile_id
      answer_text: JSON.stringify(payload),
      evidence_ids,
      created_at: createdAt,
      expires_at: expiresAt
    }]);

  if (error) return { ok: false, error: error.message };
  return { ok: true, bucket, expires_at: expiresAt };
}
