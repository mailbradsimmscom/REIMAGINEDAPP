// src/routes/debug.js
import { Router } from 'express';
import { embedOne } from '../services/ai/openaiAdapter.js';
import { pcQuery } from '../services/vector/pineconeAdapter.js';

const router = Router();

/**
 * GET /debug/vector?q=...&topK=5&ns=world
 * If ns is "__default__" or empty, we omit namespace to let SDK use default.
 */
router.get('/vector', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const topK = Number(req.query.topK || process.env.RETRIEVAL_TOPK || 5);
    let ns = req.query.ns || req.query.namespace || (process.env.PINECONE_NAMESPACE || '').trim();

    // Normalize: treat "__default__" or empty as undefined (no .namespace() call)
    if (!ns || ns === '__default__') ns = undefined;

    if (!q) return res.json({ q, topK, namespace: ns ?? '(default)', matches: [] });

    const vec = await embedOne(q);
    const matches = await pcQuery({ vector: vec, topK, namespace: ns });

    res.json({ q, topK, namespace: ns ?? '(default)', matches });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/', (_req, res) => {
  res.json({ ok: true, routes: ['/debug/vector?q=...&topK=5&ns=world'] });
});

export default router;
