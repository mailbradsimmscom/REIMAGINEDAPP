// src/routes/api.js
import { Router } from 'express';
import { z } from 'zod';
import { ingestText } from '../services/knowledge/ingestionService.js';
import { updateDocument, deleteDocument } from '../services/knowledge/documentMutations.js';
import { semanticSearch } from '../services/knowledge/retrievalService.js';

const router = Router();

/**
 * API root (ping)
 */
router.get('/', (_req, res) => {
  res.json({ ok: true, route: 'api root' });
});

/**
 * POST /api/ingest/text
 * Create or upsert a document; chunks -> embed -> Pinecone upsert.
 */
router.post('/ingest/text', async (req, res) => {
  try {
    const Schema = z.object({
      id: z.string().uuid().optional(),
      system_id: z.string().uuid().optional(),
      knowledge_type: z.string().min(1),
      title: z.string().min(1),
      content: z.string().min(1),
      source: z.string().optional(),
      tags: z.array(z.string()).optional()
    });
    const payload = Schema.parse(req.body ?? {});
    const out = await ingestText(payload);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Bad Request' });
  }
});

/**
 * PUT /api/docs/:id
 * Idempotent update; reindexes only when content hash changes.
 */
router.put('/docs/:id', async (req, res) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const Body = z.object({
      content: z.string().min(1).optional(),
      title: z.string().optional(),
      source: z.string().optional(),
      tags: z.array(z.string()).optional()
    });
    const body = Body.parse(req.body ?? {});
    const out = await updateDocument(id, body);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Bad Request' });
  }
});

/**
 * DELETE /api/docs/:id
 * Soft delete in DB, then purge vectors by { docId } in Pinecone.
 */
router.delete('/docs/:id', async (req, res) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const out = await deleteDocument(id);
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Bad Request' });
  }
});

/**
 * GET /api/search?q=...&topK=5&includeWorld=true|false
 * Searches your prod namespace; optionally merges with WORLD namespace.
 */
router.get('/search', async (req, res) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const topK = req.query.topK ? Number(req.query.topK) : 5;
    const includeWorld = req.query.includeWorld !== 'false';
    const matches = await semanticSearch({ query: q, topK, includeWorld });
    res.json({ matches });
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Bad Request' });
  }
});

export default router;
