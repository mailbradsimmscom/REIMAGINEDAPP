// src/routes/admin.js
import { Router } from 'express';
import supabase from '../config/supabase.js';
import {
  cacheLookup,
  cacheStore,
  computeCacheKeyPreview
} from '../services/cache/answerCacheService.js';
import { embedText } from '../services/ai/aiService.js';

const router = Router();

/**
 * GET /admin/supabase
 * Lightweight health check + tiny summary.
 */
router.get('/supabase', async (_req, res) => {
  if (!supabase) {
    return res.json({ ok: false, health: { ok: false, error: 'No Supabase client' }, summary: null, error: 'No Supabase client' });
  }
  try {
    // Tiny probe: count(standards_playbooks_compat) may be restricted by RLS; fall back to a simple select limit 1
    const { data, error } = await supabase
      .from('standards_playbooks_compat')
      .select('id')
      .limit(1);

    if (error) {
      return res.json({ ok: true, health: { ok: true, warning: error.message }, summary: {} });
    }
    return res.json({ ok: true, health: { ok: true }, summary: {} });
  } catch (e) {
    return res.json({ ok: false, health: { ok: false, error: e.message }, summary: null, error: 'Probe failed' });
  }
});

/**
 * GET /admin/cache
 * List recent cache rows (answers_cache).
 * Query: ?limit=10
 */
router.get('/cache', async (req, res) => {
  if (!supabase) return res.json({ ok: false, error: 'No Supabase client' });
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10) || 10, 100));
  try {
    const { data, error, count } = await supabase
      .from('answers_cache')
      .select('id,intent_key,created_at,expires_at,evidence_ids', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return res.json({ ok: false, error: error.message });
    return res.json({ ok: true, count: count || (data?.length || 0), rows: data || [] });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

/**
 * GET /admin/cache/:id
 * Fetch a single cache row by UUID.
 */
router.get('/cache/:id', async (req, res) => {
  if (!supabase) return res.json({ ok: false, error: 'No Supabase client' });
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('answers_cache')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.json({ ok: false, error: error.message });
    if (!data) return res.json({ ok: false, error: 'not_found' });

    // Try to parse the answer payload for convenience
    let parsed = null;
    try { parsed = JSON.parse(data.answer_text || 'null'); } catch { /* ignore */ }

    return res.json({ ok: true, row: data, parsed });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /admin/cache
 * Delete by intent_key prefix (bucket_prefix).
 * Query: ?bucket_prefix=sem:text-embedding-3-large:none:
 */
router.delete('/cache', async (req, res) => {
  if (!supabase) return res.json({ ok: false, error: 'No Supabase client' });
  const prefix = String(req.query.bucket_prefix || '').trim();
  if (!prefix) return res.json({ ok: false, error: 'missing bucket_prefix' });

  try {
    const { error } = await supabase
      .from('answers_cache')
      .delete()
      .like('intent_key', `${prefix}%`);

    if (error) return res.json({ ok: false, error: error.message });
    return res.json({ ok: true });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

/**
 * GET /admin/answers
 * Search recent Q/A text (boat_conversations).
 * Query: ?q=membrane&limit=5
 */
router.get('/answers', async (req, res) => {
  if (!supabase) return res.json({ ok: false, error: 'No Supabase client' });
  const q = String(req.query.q || '').trim();
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10) || 10, 100));

  try {
    let query = supabase
      .from('boat_conversations')
      .select('id,user_question,ai_response,confidence_score,sources_used,was_helpful,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (q) {
      // ilike on question or answer
      query = query.or(`user_question.ilike.%${q}%,ai_response.ilike.%${q}%`);
    }

    const { data, error, count } = await query;

    if (error) return res.json({ ok: false, error: error.message });
    return res.json({ ok: true, count: count || (data?.length || 0), rows: data || [] });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

/**
 * GET /admin/cache/diag
 * Quick embedding sanity — returns vector length and model used.
 */
router.get('/cache/diag', async (_req, res) => {
  try {
    const vec = await embed('diagnostic probe');
    const dim = Array.isArray(vec) ? vec.length : 0;
    const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
    return res.json({ ok: true, embedding_dim: dim, model });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

export default router;
