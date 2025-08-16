// src/routes/documents.js
import { Router } from 'express';
import { listDocuments } from '../services/documentService.js';

const router = Router();

/**
 * GET /documents?boat_id=<uuid>
 * Lists documents from system_knowledge. If boat_id provided, filters by it.
 */
router.get('/', async (req, res) => {
  try {
    const { boat_id } = req.query;
    const docs = await listDocuments(boat_id);
    res.json({ ok: true, docs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
