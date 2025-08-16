import { Router } from 'express';

const router = Router();

// Example legacy endpoint
router.get('/', (req, res) => {
  res.json({ ok: true, route: 'legacy root' });
});

// Keep old/compat routes here…

export default router;
