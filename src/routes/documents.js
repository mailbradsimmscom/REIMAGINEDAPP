// src/routes/documents.js
import { Router } from 'express';
import { listDocuments } from '../services/documentService.js';

const router = Router();

/**
 * GET /documents
 * Lists documents from system_knowledge.
 */
router.get('/', async (_req, res) => {
  try {
    const docs = await listDocuments();
    res.json({ ok: true, docs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
