import { Router } from 'express';
// import { insertFeedback } from '../services/feedbackService.js';

const router = Router();

router.post('/feedback', async (req, res) => {
  try {
    // const { message, rating, question, meta } = req.body;
    // const result = await insertFeedback({
    //   question,
    //   answerId: meta?.answer_id,
    //   thumb: typeof rating === 'number' ? (rating >= 4 ? 'up' : rating <= 2 ? 'down' : null) : null,
    //   reason: message,
    //   intent: meta?.intent,
    //   entities: meta?.entities,
    //   evidenceIds: meta?.evidence_ids,
    // });
    // return res.json(result);
    res.json({ ok: true, received: req.body });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
