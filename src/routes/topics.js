import { Router } from 'express';
// import { getTopics } from '../services/documentService.js';

const router = Router();

router.get('/', async (_req, res) => {
  // const topics = await getTopics();
  // return res.json({ ok: true, topics });
  res.json({ ok: true, topics: [] });
});

export default router;
