#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing @supabase/supabase-js (if needed)…"
npm ls @supabase/supabase-js >/dev/null 2>&1 || npm i @supabase/supabase-js@2 -y

mkdir -p src/services/data

############################################
# Supabase Adapter (low-level)
############################################
cat > src/services/data/supabaseAdapter.js <<'JS'
const { createClient } = require('@supabase/supabase-js');

/**
 * Creates a Supabase client:
 * - prefers SERVICE_ROLE key if present (for server writes),
 * - falls back to ANON key for read-only.
 */
function createSb() {
  const url = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Default table names (override via env)
const TBL_DOCS = process.env.SUPABASE_TABLE_DOCUMENTS || 'documents';
const TBL_FEEDBACK = process.env.SUPABASE_TABLE_FEEDBACK || 'feedback';

/**
 * Ping/health
 */
async function health() {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'Missing SUPABASE_URL or key' };
  try {
    // trivial select to confirm connectivity; many projects have 'documents'
    const { error } = await sb.from(TBL_DOCS).select('id', { count: 'exact', head: true, limit: 1 });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * List documents (safe shape)
 */
async function listDocuments({ limit = 50, offset = 0 } = {}) {
  const sb = createSb();
  if (!sb) return { ok: false, items: [], error: 'No Supabase client' };
  try {
    const { data, error } = await sb
      .from(TBL_DOCS)
      .select('id,title,topic,source,updated_at')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { ok: false, items: [], error: error.message };
    return { ok: true, items: data || [] };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

/**
 * Aggregate topics (distinct + counts)
 */
async function listTopics() {
  const sb = createSb();
  if (!sb) return { ok: false, items: [], error: 'No Supabase client' };
  try {
    // If you already maintain a topics table, you can switch to that.
    // Here we compute from documents.topic
    const { data, error } = await sb
      .from(TBL_DOCS)
      .select('topic, count:topic', { count: 'exact' });
    if (error) return { ok: false, items: [], error: error.message };

    // Collate counts by topic
    const map = new Map();
    for (const row of data || []) {
      const t = row.topic || 'untagged';
      map.set(t, (map.get(t) || 0) + 1);
    }
    const items = Array.from(map.entries()).map(([topic, count]) => ({ topic, count }));
    items.sort((a, b) => b.count - a.count);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

/**
 * Save feedback
 * body: { message?, rating?, question?, answer?, meta? }
 */
async function saveFeedback(body = {}) {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'No Supabase client' };
  const record = {
    message: body.message ?? null,
    rating: typeof body.rating === 'number' ? body.rating : null,
    question: body.question ?? null,
    answer: body.answer ?? null,
    meta: body.meta ?? null,
    created_at: new Date().toISOString()
  };
  try {
    const { data, error } = await sb.from(TBL_FEEDBACK).insert(record).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, item: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  supabaseAdapter: {
    health,
    listDocuments,
    listTopics,
    saveFeedback
  }
};
JS

############################################
# Data Service (high-level, used by controllers)
############################################
cat > src/services/data/dataService.js <<'JS'
const { supabaseAdapter } = require('./supabaseAdapter');

async function health() {
  return supabaseAdapter.health();
}
async function listDocuments(opts) {
  return supabaseAdapter.listDocuments(opts);
}
async function listTopics() {
  return supabaseAdapter.listTopics();
}
async function saveFeedback(body) {
  return supabaseAdapter.saveFeedback(body);
}

module.exports = { dataService: { health, listDocuments, listTopics, saveFeedback } };
JS

############################################
# Wire controllers to data service
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
    if (!index) {
      return res.json({ ok: false, error: 'Missing PINECONE credentials or index name' });
    }
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

/** Supabase status */
async function getSupabaseStatus(_req, res) {
  const h = await dataService.health();
  res.status(h.ok ? 200 : 500).json(h);
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
# Route: expose /admin/supabase
############################################
cat > src/routes/legacy.js <<'JS'
const { Router } = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const C = require('../controllers/legacyController');

const r = Router();

r.use('/admin', adminAuth, Router()
  .get('/', C.getAdminHome)
  .get('/pinecone', C.getPineconeStatus)
  .get('/world/settings', C.getWorldSettings)
  .get('/supabase', C.getSupabaseStatus)
  .get('/debug/keyword', C.getDebugKeyword)
  .get('/debug/textsearch', C.getDebugTextSearch)
);

// Public legacy endpoints
r.get('/documents', C.listDocuments);
r.get('/topics', C.listTopics);
r.get('/playbooks', C.getPlaybooks);
r.post('/feedback', C.postFeedback);

module.exports = r;
JS

############################################
# Parity check for data endpoints
############################################
cat > scripts/parity_check_data.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3000"
TOKEN_HEADER=()
if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  TOKEN_HEADER=(-H "x-admin-token: ${ADMIN_TOKEN}")
fi

echo "== Admin: Supabase =="
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/supabase" && echo

echo "== Documents =="
curl -sf "$BASE/documents" && echo

echo "== Topics =="
curl -sf "$BASE/topics" && echo

echo "== Feedback insert (200 even if table missing will show error payload) =="
curl -sf -X POST "$BASE/feedback" -H 'Content-Type: application/json' \
  -d '{"message":"great answer","rating":5,"question":"Q?","answer":"A!","meta":{"route":"test"}}' && echo
SH
chmod +x scripts/parity_check_data.sh

# Helpful .env hints (non-destructive)
touch .env
grep -q '^SUPABASE_TABLE_DOCUMENTS=' .env || echo 'SUPABASE_TABLE_DOCUMENTS=documents' >> .env
grep -q '^SUPABASE_TABLE_FEEDBACK=' .env || echo 'SUPABASE_TABLE_FEEDBACK=feedback' >> .env

echo "==> Step 2 services installed."
echo "   • Click Stop → Run, then: bash scripts/parity_check_data.sh"
