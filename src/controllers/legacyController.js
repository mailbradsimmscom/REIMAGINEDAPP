import { Pinecone } from '@pinecone-database/pinecone';
import { dataService } from '../services/data/dataService.js';

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

export {
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
