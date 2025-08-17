// src/routes/admin.js
import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { embedOne } from '../services/ai/openaiAdapter.js';
import { cacheStore } from '../services/cache/answerCacheService.js';

const router = Router();

// --- health
router.get('/supabase', async (_req, res) => {
  try {
    if (!supabase) return res.json({ ok: false, health: { ok: false, error: 'No Supabase client' }, summary: null, error: 'No Supabase client' });

    const { error } = await supabase.from('app_settings').select('key', { count: 'exact', head: true }).limit(1);
    if (error) return res.json({ ok: false, health: { ok: false, error: error.message }, summary: null, error: error.message });

    res.json({ ok: true, health: { ok: true }, summary: {} });
  } catch (e) {
    res.json({ ok: false, health: { ok: false, error: e.message }, summary: null, error: e.message });
  }
});

// --- answers: browse boat_conversations
// GET /admin/answers?boat_id=...&q=...&limit=20
router.get('/answers', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ ok: false, error: 'No Supabase client' });

    const boatId = req.query.boat_id || null;
    const q = (req.query.q || '').toString().trim();
    const limit = Math.min(200, Number(req.query.limit || 20));

    let query = supabase
      .from('boat_conversations')
      .select('id, boat_id, user_question, ai_response, confidence_score, sources_used, was_helpful, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (boatId) query = query.eq('boat_id', boatId);
    if (q) {
      // Basic server-side filter (ILIKE on question/answer)
      query = query.or(`user_question.ilike.%${q}%,ai_response.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    res.json({ ok: true, count: data?.length || 0, rows: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- cache list
router.get('/cache', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ ok: false, error: 'No Supabase client' });

    const boatId = req.query.boat_id || null;
    const limit = Math.min(200, Number(req.query.limit || 50));

    let q = supabase
      .from('answers_cache')
      .select('id, intent_key, boat_profile_id, created_at, expires_at, evidence_ids')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (boatId) q = q.eq('boat_profile_id', boatId);

    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    res.json({ ok: true, count: data?.length || 0, rows: data || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- cache diag (keep underscores to avoid :id collision)
router.get('/cache/_diag', async (_req, res) => {
  try {
    const v = await embedOne('healthcheck');
    res.json({
      ok: true,
      embedding: { length: Array.isArray(v) ? v.length : 0, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-large' },
      openai_key_present: !!process.env.OPENAI_API_KEY,
      supabase_present: !!supabase
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- cache test-store (foreground)
router.post('/cache/_test-store', async (req, res) => {
  try {
    const { question = 'watermaker maintenance schedule', boat_id = null } = req.body || {};
    const structuredAnswer = {
      title: 'Answer',
      summary: 'Test cache entry: watermaker maintenance schedule.',
      bullets: ['Every 100–120 hours: replace 5 micron', 'Every 15–20 days: air purge 2–3 min'],
      cta: null,
      raw: { text: 'Test cache payload', references: [] }
    };

    const out = await cacheStore({
      question,
      boatId: boat_id,
      structuredAnswer,
      references: []
    });

    if (!out.ok) return res.status(500).json({ ok: false, error: out.error || out.reason });
    res.json({ ok: true, result: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- cache item
router.get('/cache/:id', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ ok: false, error: 'No Supabase client' });

    const { data, error } = await supabase
      .from('answers_cache')
      .select('id, intent_key, boat_profile_id, created_at, expires_at, answer_text, evidence_ids')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ ok: false, error: error.message });
    res.json({ ok: true, row: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- cache purge
router.delete('/cache', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ ok: false, error: 'No Supabase client' });

    const { bucket_prefix, boat_id } = req.query || {};
    if (!bucket_prefix && !boat_id) {
      return res.status(400).json({ ok: false, error: 'Provide bucket_prefix or boat_id' });
    }

    let q = supabase.from('answers_cache').delete();
    if (bucket_prefix) q = q.like('intent_key', `${bucket_prefix}%`);
    if (boat_id) q = q.eq('boat_profile_id', boat_id);

    const { error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- diag
router.get('/diag', (_req, res) => {
  res.json({
    ok: true,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
      VECTOR_DIM: process.env.VECTOR_DIM,
      PINECONE_INDEX_NAME: process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME,
      WORLD_NAMESPACE: process.env.WORLD_NAMESPACE || 'world',
      WORLD_INCLUDE_MIN: process.env.WORLD_INCLUDE_MIN,
      WORLD_WEIGHT: process.env.WORLD_WEIGHT,
      SIMILARITY_THRESHOLD: process.env.SIMILARITY_THRESHOLD,
      CACHE_TTL_MINUTES: process.env.CACHE_TTL_MINUTES,
      DEBUG_SEARCH: process.env.DEBUG_SEARCH,
      TRACE_MAX: process.env.TRACE_MAX
    }
  });
});

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    routes: [
      'GET  /admin/supabase',
      'GET  /admin/answers?boat_id=...&q=...&limit=20',
      'GET  /admin/cache?boat_id=...&limit=50',
      'GET  /admin/cache/_diag',
      'POST /admin/cache/_test-store',
      'GET  /admin/cache/:id',
      'DEL  /admin/cache?bucket_prefix=sem:text-embedding-3-large:none:&boat_id=...',
      'GET  /admin/diag'
    ]
  });
});

export default router;
