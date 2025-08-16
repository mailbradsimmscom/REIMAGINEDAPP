import { Router } from 'express';
// If you’ve wired services, you can later do:
// import { listDocuments } from '../services/documentService.js';

const router = Router();

router.get('/', async (req, res) => {
  // const { boat_id } = req.query;
  // const docs = await listDocuments(boat_id);
  // return res.json({ ok: true, docs });
  res.json({ ok: true, docs: [] });
});

export default router;
