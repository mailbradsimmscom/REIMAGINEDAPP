// src/routes/debug.js
import { Router } from 'express';
import { listTraces, getTrace, clearTraces } from '../services/debug/traceStore.js';

const router = Router();

// List recent traces (most recent first)
router.get('/trace', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit || 50));
  res.json({ ok: true, traces: listTraces({ limit }) });
});

// Fetch a specific trace by requestId
router.get('/trace/:requestId', (req, res) => {
  const t = getTrace(req.params.requestId);
  if (!t) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, requestId: req.params.requestId, ...t });
});

// Clear all in-memory traces (dev only)
router.delete('/trace', (req, res) => {
  const out = clearTraces();
  res.json({ ok: true, ...out });
});

// Default
router.get('/', (_req, res) => {
  res.json({
    ok: true,
    routes: [
      'GET  /debug/trace?limit=50',
      'GET  /debug/trace/:requestId',
      'DEL  /debug/trace'
    ]
  });
});

export default router;
