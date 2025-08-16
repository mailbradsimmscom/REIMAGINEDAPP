const { Router } = require('express');
const { pineconeAdapter } = require('../services/vector/pineconeAdapter');
const { openaiEmbeddingAdapter } = require('../services/ai/openaiEmbeddingAdapter');

const router = Router();

router.get('/vector', async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    const topK = parseInt(String(req.query.topK || '5'), 10);
    const namespace = req.query.ns ? String(req.query.ns) : (process.env.PINECONE_NAMESPACE || undefined);

    if (!q) return res.status(400).json({ error: 'Missing q' });

    const vector = await openaiEmbeddingAdapter.embed(q);
    const matches = await pineconeAdapter.query({ vector, topK, namespace });

    res.json({ q, topK, namespace: namespace || '__default__', matches });
  } catch (err) {
    err.status = 500;
    next(err);
  }
});

module.exports = router;
