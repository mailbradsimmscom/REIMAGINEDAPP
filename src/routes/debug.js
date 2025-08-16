import { Router } from 'express';

const router = Router();

// Example debug endpoint
router.get('/', (req, res) => {
  res.json({ ok: true, route: 'debug root' });
});

// Add other debug tools here…

export default router;
