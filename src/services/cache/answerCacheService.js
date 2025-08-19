// src/services/cache/answerCacheService.js
import supabase from '../../config/supabase.js';
import { createHash } from 'node:crypto';

/**
 * Normalize the question so semantically equivalent strings hash the same.
 */
function normalizeQuestion(q = '') {
  return String(q)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic short hash (sha1 base64url, 16 chars).
 */
function shortHash(s) {
  const h = createHash('sha1').update(s).digest('base64url');
  return h.slice(0, 16);
}

/**
 * Compute the semantic intent key used in answers_cache.intent_key.
 * Intent key includes the embedding model + short hash of the normalized text.
 */
function computeIntentKey({ question }) {
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
  const normalized = normalizeQuestion(question || '');
  // For future: could include a projection of the embedding to avoid near-duplicate collisions
  const h = shortHash(normalized);
  return `sem:${model}:${h}`;
}

/**
 * TTL policy (in hours). Default 3h.
 */
function ttlHours() {
  const v = Number(process.env.CACHE_TTL_HOURS || 3);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

/**
 * Lookup an answer in answers_cache by semantic key.
 * Soft-fails to {hit:false} if Supabase is unavailable.
 */
export async function cacheLookup({ question }) {
  if (!supabase) return { hit: false, reason: 'no_supabase' };

  try {
    const intentKey = computeIntentKey({ question });

    const { data, error } = await supabase
      .from('answers_cache')
      .select('id, intent_key, answer_text, evidence_ids, created_at, expires_at')
      .eq('intent_key', intentKey)
      .maybeSingle();

    if (error || !data) {
      return { hit: false, intentKey };
    }

    // Optional: refresh-on-hit policy — extend TTL on access
    const now = Date.now();
    const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    if (exp && exp < now) {
      // expired; treat as miss
      return { hit: false, intentKey, expired: true };
    }

    // Lazy refresh: bump expires_at forward without blocking
    (async () => {
      try {
        const newExp = new Date(now + ttlHours() * 3600 * 1000).toISOString();
        await supabase
          .from('answers_cache')
          .update({ expires_at: newExp })
          .eq('id', data.id);
      } catch { /* ignore */ }
    })();

    let payload = null;
    try {
      payload = JSON.parse(data.answer_text || 'null');
    } catch {
      payload = null;
    }

    return {
      hit: true,
      intentKey,
      id: data.id,
      payload,
      evidence_ids: Array.isArray(data.evidence_ids) ? data.evidence_ids : [],
      created_at: data.created_at,
      expires_at: data.expires_at
    };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[cacheLookup] error:', e.message);
    }
    return { hit: false, reason: 'exception' };
  }
}

/**
 * Store an answer in answers_cache.
 * `structuredAnswer` should be the full structured payload we return to clients.
 * `references` is an array of {id,source,score} (stored into evidence_ids).
 */
export async function cacheStore({ question, structuredAnswer, references = [] }) {
  if (!supabase) return { ok: false, reason: 'no_supabase' };

  try {
    const intentKey = computeIntentKey({ question });
    const now = Date.now();
    const expiresAt = new Date(now + ttlHours() * 3600 * 1000).toISOString();

    const evidence_ids = references
      .map(r => r?.id)
      .filter(Boolean)
      .slice(0, 16); // don’t bloat rows

    const answer_text = JSON.stringify(structuredAnswer || null);

    const { error } = await supabase
      .from('answers_cache')
      .upsert(
        {
          intent_key: intentKey,
          answer_text,
          evidence_ids,
          created_at: new Date(now).toISOString(),
          expires_at: expiresAt
        },
        {
          // MUST match the DB unique index (intent_key)
          onConflict: 'intent_key'
        }
      );

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[cacheStore] supabase upsert error:', error.message);
      }
      return { ok: false, intentKey, error: error.message };
    }

    return { ok: true, intentKey, expiresAt };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[cacheStore] error:', e.message);
    }
    return { ok: false, reason: 'exception' };
  }
}

/**
 * Expose a helper to compute the semantic key externally (debug/admin use).
 */
export function computeCacheKeyPreview({ question }) {
  return computeIntentKey({ question });
}

export default { cacheLookup, cacheStore, computeCacheKeyPreview };
