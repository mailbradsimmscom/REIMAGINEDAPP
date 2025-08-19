#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/services/data

############################################
# Supabase Adapter mapped to your tables
############################################
cat > src/services/data/supabaseAdapter.js <<'JS'
const { createClient } = require('@supabase/supabase-js');

function createSb() {
  const url = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Map to your existing tables (override via .env if needed)
const TBL_KNOWLEDGE = process.env.SUPABASE_TABLE_KNOWLEDGE || 'system_knowledge';
const TBL_QA_FEEDBACK = process.env.SUPABASE_TABLE_QA_FEEDBACK || 'qa_feedback';

/**
 * Health: simple select to confirm connectivity and table presence
 */
async function health() {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'Missing SUPABASE_URL or key' };
  try {
    const { error } = await sb.from(TBL_KNOWLEDGE).select('id', { count: 'exact', head: true, limit: 1 });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * List "documents" from system_knowledge
 * Output shape: { id, title, topic, source, updated_at }
 */
async function listDocuments({ limit = 50, offset = 0 } = {}) {
  const sb = createSb();
  if (!sb) return { ok: false, items: [], error: 'No Supabase client' };
  try {
    const { data, error } = await sb
      .from(TBL_KNOWLEDGE)
      .select('id,title,knowledge_type,source,updated_at')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { ok: false, items: [], error: error.message };
    const items = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      topic: row.knowledge_type || 'untagged',
      source: row.source || null,
      updated_at: row.updated_at || null
    }));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

/**
 * Aggregate topics from system_knowledge. Topic = knowledge_type
 */
async function listTopics() {
  const sb = createSb();
  if (!sb) return { ok: false, items: [], error: 'No Supabase client' };
  try {
    // Return all rows of knowledge_type and aggregate in app (portable across Postgrest versions)
    const { data, error } = await sb
      .from(TBL_KNOWLEDGE)
      .select('knowledge_type');
    if (error) return { ok: false, items: [], error: error.message };

    const counts = new Map();
    for (const row of data || []) {
      const t = row.knowledge_type || 'untagged';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const items = Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

/**
 * Save feedback into qa_feedback
 * Maps our body -> qa_feedback schema
 *   question: string
 *   answer_id: string | null (from meta.answer_id)
 *   thumb: 'up' | 'down' | null  (derive from rating)
 *   reason: text (from message)
 *   intent: text (from meta.intent)
 *   entities: jsonb (from meta.entities)
 *   evidence_ids: jsonb (from meta.evidence_ids)
 */
function ratingToThumb(rating) {
  if (typeof rating !== 'number') return null;
  if (rating >= 4) return 'up';
  if (rating <= 2) return 'down';
  return null;
}

async function saveFeedback(body = {}) {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'No Supabase client' };
  const meta = body.meta || {};
  const record = {
    question: body.question ?? null,
    answer_id: meta.answer_id ?? null,
    thumb: body.thumb ?? ratingToThumb(body.rating),
    reason: body.message ?? null,
    intent: meta.intent ?? null,
    entities: meta.entities ?? null,
    evidence_ids: meta.evidence_ids ?? null,
    // created_at: db default handles timestamp
  };
  try {
    const { data, error } = await sb.from(TBL_QA_FEEDBACK).insert(record).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, item: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Admin summary: quick counts of key tables
 */
async function adminSummary() {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'No Supabase client' };
  try {
    const counts = {};
    for (const [tbl, key] of [
      [TBL_KNOWLEDGE, 'system_knowledge'],
      [TBL_QA_FEEDBACK, 'qa_feedback'],
      ['boat_profile', 'boat_profile'],
      ['boat_systems', 'boat_systems'],
      ['boat_conversations', 'boat_conversations'],
      ['answers_cache', 'answers_cache'],
      ['standards_playbooks_compat', 'standards_playbooks_compat'],
      ['world_cache', 'world_cache']
    ]) {
      const { count, error } = await sb.from(tbl).select('*', { count: 'exact', head: true });
      counts[key] = error ? null : count;
    }
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  supabaseAdapter: {
    health,
    listDocuments,
    listTopics,
    saveFeedback,
    adminSummary
  }
};
JS

############################################
# Data Service passthrough
############################################
cat > src/services/data/dataService.js <<'JS'
const { supabaseAdapter } = require('./supabaseAdapter');

async function health() { return supabaseAdapter.health(); }
async function listDocuments(opts) { return supabaseAdapter.listDocuments(opts); }
async function listTopics() { return supabaseAdapter.listTopics(); }
async function saveFeedback(body) { return supabaseAdapter.saveFeedback(body); }
async function adminSummary() { return supabaseAdapter.adminSummary(); }

module.exports = { dataService: { health, listDocuments, listTopics, saveFeedback, adminSummary } };
JS

############################################
# Update legacyController to use adminSummary
############################################
cat > src/controllers/legacyController.js <<'JS'
const { Pinecone } = require('@pinecone-database/pinecone');
const { dataService } = require('../services/data/dataService');

function pineconeIndex() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME;
  if (!apiKey || !indexName) return null;
  const client = new Pinecone({ apiKey });
  return client.index(indexName);
}

/** Admin home */
async function getAdminHome(_req, res) {
  res.json({ ok: true, section: 'admin', routes: ['/admin/pinecone', '/admin/world/settings', '/admin/supabase', '/admin/debug/*'] });
}

/** Pinecone status */
async function getPineconeStatus(_req, res) {
  try {
    const index = pineconeIndex();
    if (!index) return res.json({ ok: false, error: 'Missing PINECONE credentials or index name' });
    const stats = await index.describeIndexStats({});
    const indexName = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME;
    res.json({
      ok: true,
      index: indexName,
      vectorCount: stats.totalVectorCount || stats.vectorCount || null,
      dimensions: process.env.VECTOR_DIM ? Number(process.env.VECTOR_DIM) : null,
      namespaces: Object.keys(stats.namespaces || {}),
      raw: { stats }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/** World settings */
async function getWorldSettings(_req, res) {
  res.json({
    ok: true,
    namespace: process.env.WORLD_NAMESPACE || 'world',
    includeMin: parseFloat(process.env.WORLD_INCLUDE_MIN || '0.75'),
    allowlist: process.env.WORLD_ALLOWLIST || '*'
  });
}

/** Supabase status and counts */
async function getSupabaseStatus(_req, res) {
  const h = await dataService.health();
  const s = await dataService.adminSummary();
  const status = { ok: h.ok && s.ok, health: h, summary: s.ok ? s.counts : null, error: s.ok ? null : s.error };
  res.status(status.ok ? 200 : 500).json(status);
}

/** Debug (stubs for now) */
async function getDebugKeyword(req, res) {
  const q = String(req.query.q || '');
  res.json({ ok: true, tool: 'debug/keyword', q, note: 'wire keyword debug implementation' });
}
async function getDebugTextSearch(req, res) {
  const q = String(req.query.q || '');
  res.json({ ok: true, tool: 'debug/textsearch', q, note: 'wire text search implementation' });
}

/** Public legacy: documents/topics/playbooks/feedback */
async function listDocuments(req, res) {
  const limit = Number(req.query.limit || 50);
  const offset = Number(req.query.offset || 0);
  const out = await dataService.listDocuments({ limit, offset });
  res.status(out.ok ? 200 : 500).json(out);
}
async function listTopics(_req, res) {
  const out = await dataService.listTopics();
  res.status(out.ok ? 200 : 500).json(out);
}
async function getPlaybooks(_req, res) {
  res.json({ ok: true, enabled: (process.env.PLAYBOOKS_ENABLED || 'false') === 'true', items: [] });
}
async function postFeedback(req, res) {
  const out = await dataService.saveFeedback(req.body || {});
  res.status(out.ok ? 200 : 500).json(out);
}

module.exports = {
  getAdminHome,
  getPineconeStatus,
  getWorldSettings,
  getSupabaseStatus,
  getDebugKeyword,
  getDebugTextSearch,
  listDocuments,
  listTopics,
  getPlaybooks,
  postFeedback
};
JS

############################################
# .env defaults for these tables
############################################
touch .env
grep -q '^SUPABASE_TABLE_KNOWLEDGE=' .env || echo 'SUPABASE_TABLE_KNOWLEDGE=system_knowledge' >> .env
grep -q '^SUPABASE_TABLE_QA_FEEDBACK=' .env || echo 'SUPABASE_TABLE_QA_FEEDBACK=qa_feedback' >> .env

echo "✅ Supabase mapping patched to your existing tables."
echo "   • /documents now reads from system_knowledge"
echo "   • /topics aggregates system_knowledge.knowledge_type"
echo "   • /feedback inserts into qa_feedback"
echo "   • /admin/supabase shows counts of key tables"
