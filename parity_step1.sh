#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/routes src/controllers src/middleware

########################################
# 1) Restore BFF routes
########################################
cat > src/routes/bff.js <<'JS'
const { Router } = require('express');
const { handleQueryWeb, handleQueryIos } = require('../controllers/queryController');

const router = Router();

router.post('/web/query', handleQueryWeb || ((_req, res) => res.status(501).json({ error: 'Web BFF not wired' })));
router.post('/ios/query', handleQueryIos || ((_req, res) => res.status(501).json({ error: 'iOS BFF not wired' })));

module.exports = router;
JS

# Re-wire index router to include BFF alongside API/DEBUG/LEGACY
cat > src/routes/index.js <<'JS'
const { Router } = require('express');
const api = require('./api');
const debug = require('./debug');
const legacy = require('./legacy');
const bff = require('./bff');

const router = Router();

// Current app routes
router.use('/api', api);
router.use('/bff', bff);
router.use('/debug', debug);

// Legacy & admin routes
router.use('/legacy', legacy);    // e.g., /legacy/documents
router.use('/', legacy);          // back-compat: /admin/* , /documents, /topics, etc.

module.exports = router;
JS

########################################
# 2) Add /ready route to index.js (idempotent)
########################################
if ! grep -q "app.get('/ready'" index.js 2>/dev/null; then
  # Insert /ready right before /health (keeps code tidy)
  sed -i "s|app.get('/health'|app.get('/ready', (_req, res) => res.json({ ok: true, ready: true, time: new Date().toISOString() }));\n\napp.get('/health'|" index.js
fi

########################################
# 3) Implement real Pinecone status in /admin/pinecone
########################################
cat > src/controllers/legacyController.js <<'JS'
const { Pinecone } = require('@pinecone-database/pinecone');

function pineconeIndex() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME;
  if (!apiKey || !indexName) return null;
  const client = new Pinecone({ apiKey });
  return client.index(indexName);
}

/** Admin home */
async function getAdminHome(_req, res) {
  res.json({ ok: true, section: 'admin', routes: ['/admin/pinecone', '/admin/world/settings', '/admin/debug/*'] });
}

/** Pinecone status — describe stats + namespaces */
async function getPineconeStatus(_req, res) {
  try {
    const index = pineconeIndex();
    if (!index) {
      return res.json({ ok: false, error: 'Missing PINECONE credentials or index name' });
    }
    // index.describeIndexStats() returns vectorCount and namespaces info
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

/** Debug stubs (to wire real logic later) */
async function getDebugKeyword(req, res) {
  const q = String(req.query.q || '');
  res.json({ ok: true, tool: 'debug/keyword', q, note: 'wire actual keyword debug logic here' });
}
async function getDebugTextSearch(req, res) {
  const q = String(req.query.q || '');
  res.json({ ok: true, tool: 'debug/textsearch', q, note: 'wire actual text search logic here' });
}

/** Public legacy stubs */
async function listDocuments(_req, res) {
  res.json({ ok: true, items: [], note: 'wire document listing here (Supabase/FS)' });
}
async function listTopics(_req, res) {
  res.json({ ok: true, items: [], note: 'wire topics aggregation here' });
}
async function getPlaybooks(_req, res) {
  res.json({ ok: true, enabled: (process.env.PLAYBOOKS_ENABLED || 'false') === 'true', items: [] });
}
async function postFeedback(req, res) {
  const body = req.body || {};
  res.json({ ok: true, received: body, note: 'wire feedback persistence to Supabase here' });
}

module.exports = {
  getAdminHome,
  getPineconeStatus,
  getWorldSettings,
  getDebugKeyword,
  getDebugTextSearch,
  listDocuments,
  listTopics,
  getPlaybooks,
  postFeedback
};
JS

########################################
# 4) Parity check script (includes BFF + ready)
########################################
cat > scripts/parity_check_full.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3000"
TOKEN_HEADER=()
if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  TOKEN_HEADER=(-H "x-admin-token: ${ADMIN_TOKEN}")
fi

echo "== Root =="
curl -sf "$BASE/" && echo

echo "== Health / Ready =="
curl -sf "$BASE/health" && echo
curl -sf "$BASE/ready" && echo

echo "== API Query =="
curl -sf -X POST "$BASE/api/query" -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the membrane maintenance schedule"}' && echo

echo "== BFF (web / ios) =="
curl -sf -X POST "$BASE/bff/web/query" -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the membrane maintenance schedule"}' && echo
curl -sf -X POST "$BASE/bff/ios/query" -H 'Content-Type: application/json' \
  -d '{"question":"Tell me about the membrane maintenance schedule"}' && echo

echo "== Admin =="
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin" && echo
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/pinecone" && echo
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/world/settings" && echo

echo "== Debug =="
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/debug/keyword?q=membrane" && echo
curl -sf "${TOKEN_HEADER[@]}" "$BASE/admin/debug/textsearch?q=membrane" && echo

echo "== Public legacy =="
curl -sf "$BASE/documents" && echo
curl -sf "$BASE/topics" && echo
curl -sf "$BASE/playbooks" && echo

echo "== Feedback (POST) =="
curl -sf -X POST "$BASE/feedback" -H 'Content-Type: application/json' \
  -d '{"message":"great answer","rating":5}' && echo
SH
chmod +x scripts/parity_check_full.sh

echo "✅ Parity Step 1 complete:"
echo "   • BFF routes restored (/bff/web/query, /bff/ios/query)"
echo "   • /ready added"
echo "   • /admin/pinecone now returns live Pinecone stats"
echo "   • Run: bash scripts/parity_check_full.sh"
