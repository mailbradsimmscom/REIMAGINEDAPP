// src/routes/qa.js
import { Router } from 'express';
import { insertFeedback } from '../services/feedbackService.js';

const router = Router();

/**
 * POST /qa/feedback
 * Body:
 * {
 *   "message": "useful",
 *   "rating": 5,
 *   "question": "How often to replace 5 micron?",
 *   "meta": {
 *     "answer_id": "ans_123",
 *     "intent": "maintenance",
 *     "entities": {"part":"filter"},
 *     "evidence_ids": ["doc1","doc2"]
 *   }
 * }
 */
router.post('/feedback', async (req, res) => {
  try {
    const { message, rating, question, meta } = req.body || {};

    // Derive a simple 'thumb' from rating if provided
    let thumb = null;
    if (typeof rating === 'number') {
      thumb = rating >= 4 ? 'up' : rating <= 2 ? 'down' : null;
    }

    const result = await insertFeedback({
      question,
      answerId: meta?.answer_id,
      thumb,
      reason: message,
      intent: meta?.intent,
      entities: meta?.entities,
      evidenceIds: meta?.evidence_ids
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
