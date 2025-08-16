// src/routes/topics.js
import { Router } from 'express';
import { getTopics } from '../services/documentService.js';

const router = Router();

/**
 * GET /topics
 * Returns distinct knowledge_type values.
 */
router.get('/', async (_req, res) => {
  try {
    const topics = await getTopics();
    res.json({ ok: true, topics });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
