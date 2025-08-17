// src/routes/qa.js
import { Router } from 'express';
import { saveFeedback } from '../services/sql/feedbackService.js';

const router = Router();

/**
 * POST /qa/feedback
 * Body:
 * {
 *   "question": "...",
 *   "answer_id": "ans_123",   // optional
 *   "thumb": "up" | "down" | "neutral",
 *   "reason": "short text",
 *   "intent": "maintenance",  // optional
 *   "entities": {...},        // optional
 *   "evidence_ids": ["doc1","doc2"] // optional
 * }
 */
router.post('/feedback', async (req, res) => {
  try {
    const { question, answer_id, thumb, reason, intent, entities, evidence_ids } = req.body || {};

    if (!question || !thumb) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: question, thumb' });
    }

    const out = await saveFeedback({ question, answer_id, thumb, reason, intent, entities, evidence_ids });
    if (!out.ok) return res.status(500).json({ ok: false, error: out.error });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/', (_req, res) => {
  res.json({ ok: true, routes: ['POST /qa/feedback'] });
});

export default router;
