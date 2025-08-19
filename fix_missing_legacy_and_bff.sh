#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/routes src/controllers src/middleware src/services/responder

########################################
# Middleware: adminAuth (optional token)
########################################
cat > src/middleware/adminAuth.js <<'JS'
function adminAuth(req, res, next) {
  const required = process.env.ADMIN_TOKEN;
  if (!required) return next();
  const got = req.headers['x-admin-token'] || req.headers['x-admin'] || '';
  if (got === required) return next();
  res.status(401).json({ error: 'Unauthorized' });
}
module.exports = { adminAuth };
JS

########################################
# Legacy controllers (stubs; safe to extend later)
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

async function getAdminHome(_req, res) {
  res.json({ ok: true, section: 'admin', routes: ['/admin/pinecone', '/admin/world/settings', '/admin/debug/*'] });
}

async function getPineconeStatus(_req, res) {
  try {
    const index = pineconeIndex();
    if (!index) return res.json({ ok: false, error: 'Missing Pinecone credentials or index name' });
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

async function getWorldSettings(_req, res) {
  res.json({
    ok: true,
    namespace: process.env.WORLD_NAMESPACE || 'world',
    includeMin: parseFloat(process.env.WORLD_INCLUDE_MIN || '0.75'),
    allowlist: process.env.WORLD_ALLOWLIST || '*'
  });
}

async function getDebugKeyword(req, res) {
  const q = String(req.query.q || '');
  res.json({ ok: true, tool: 'debug/keyword', q, note: 'wire keyword debug later' });
}
async function getDebugTextSearch(req, res) {
  const q = String(req.query.q || '');
  res.json({ ok: true, tool: 'debug/textsearch', q, note: 'wire text search later' });
}

async function listDocuments(_req, res) {
  res.json({ ok: true, items: [], note: 'wire document listing later' });
}
async function listTopics(_req, res) {
  res.json({ ok: true, items: [], note: 'wire topics later' });
}
async function getPlaybooks(_req, res) {
  res.json({ ok: true, enabled: (process.env.PLAYBOOKS_ENABLED || 'false') === 'true', items: [] });
}
async function postFeedback(req, res) {
  const body = req.body || {};
  res.json({ ok: true, received: body, note: 'wire persistence later' });
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
# Legacy routes
########################################
cat > src/routes/legacy.js <<'JS'
const { Router } = require('express');
const { adminAuth } = require('../middleware/adminAuth');
const C = require('../controllers/legacyController');

const r = Router();

r.use('/admin', adminAuth, Router()
  .get('/', C.getAdminHome)
  .get('/pinecone', C.getPineconeStatus)
  .get('/world/settings', C.getWorldSettings)
  .get('/debug/keyword', C.getDebugKeyword)
  .get('/debug/textsearch', C.getDebugTextSearch)
);

r.get('/documents', C.listDocuments);
r.get('/topics', C.listTopics);
r.get('/playbooks', C.getPlaybooks);
r.post('/feedback', C.postFeedback);

module.exports = r;
JS

########################################
# BFF routes + rewire router index
########################################
cat > src/routes/bff.js <<'JS'
const { Router } = require('express');
const { handleQueryWeb, handleQueryIos } = require('../controllers/queryController');

const router = Router();
router.post('/web/query', handleQueryWeb);
router.post('/ios/query', handleQueryIos);
module.exports = router;
JS

cat > src/routes/index.js <<'JS'
const { Router } = require('express');
const api = require('./api');
const debug = require('./debug');
const legacy = require('./legacy');
const bff = require('./bff');

const router = Router();

router.use('/api', api);
router.use('/bff', bff);
router.use('/debug', debug);

// legacy/back-compat mounts
router.use('/legacy', legacy);
router.use('/', legacy);

module.exports = router;
JS

########################################
# Ensure queryController exports web/ios handlers
########################################
cat > src/controllers/queryController.js <<'JS'
const { z } = require('zod');
const { aiService } = require('../services/ai/aiService');
const { vectorService } = require('../services/vector/vectorService');
const { responder } = require('../services/responder/responder');
const { serialize } = require('../views/serializers');

const bodySchema = z.object({
  question: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

function handleQueryFactory(defaultShape = 'api') {
  return async function handleQuery(req, res, next) {
    try {
      const { question, metadata } = bodySchema.parse(req.body);
      const ns = metadata?.namespace;
      const ctx = await vectorService.retrieveContext(question, { topK: 5, namespace: ns });

      const draft = await aiService.answerQuestion(question, ctx, { metadata });

      const styled = await responder.applyToneAndFormat(draft, {
        // legacy layout pass-through is handled by responder env
      });

      const payload = serialize(styled, { shape: defaultShape });
      res.json(payload);
    } catch (err) {
      err.status = err.status || 400;
      err.publicMessage = err.publicMessage || err.message;
      next(err);
    }
  };
}

const handleQuery = handleQueryFactory('api');
const handleQueryWeb = handleQueryFactory('web');
const handleQueryIos = handleQueryFactory('ios');

module.exports = { handleQuery, handleQueryWeb, handleQueryIos, handleQueryFactory };
JS

########################################
# Add /ready on main app if missing
########################################
if ! grep -q "app.get('/ready'" index.js 2>/dev/null; then
  sed -i "s|app.get('/health'|app.get('/ready', (_req, res) => res.json({ ok: true, ready: true, time: new Date().toISOString() }));\n\napp.get('/health'|" index.js
fi

########################################
# Parity check script
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

echo "✅ Legacy + BFF routes restored. Restart and run parity check."
