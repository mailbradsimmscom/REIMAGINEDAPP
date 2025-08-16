import { Router } from 'express';

const router = Router();

// Example BFF endpoint
router.get('/', (req, res) => {
  res.json({ ok: true, route: 'bff root' });
});

// Add BFF logic here…

export default router;
