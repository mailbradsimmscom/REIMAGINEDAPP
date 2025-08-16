// src/routes/bff.js
import { Router } from 'express';
import { composeResponse } from '../services/responder/responder.js';
import { webSerializer, apiSerializer } from '../views/serializers.js';
import { retrieveContext } from '../services/vector/vectorService.js';

const router = Router();

async function handleQuery(req, res, { client = 'web' } = {}) {
  try {
    const { question, tone, context, references, namespace, topK } = req.body || {};

    // Prefer explicit context if provided; otherwise auto-retrieve from Pinecone
    let contextText = '';
    let refs = [];

    if (typeof context === 'string' || Array.isArray(context)) {
      contextText =
        typeof context === 'string'
          ? context
          : context.filter(Boolean).join('\n');
      refs = Array.isArray(references) ? references : [];
    } else if (question && question.trim()) {
      const { contextText: ct, references: r } = await retrieveContext(question, { namespace, topK });
      contextText = ct;
      refs = r;
    }

    const structured = composeResponse({
      question: question || '',
      contextText,
      references: refs,
      tone: tone || (client === 'ios' ? 'coach' : 'concise'),
    });

    const payload =
      client === 'web'
        ? webSerializer(structured)
        : client === 'api'
          ? apiSerializer(structured)
          : webSerializer(structured);

    res.json(payload);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

router.post('/web/query', async (req, res) => {
  await handleQuery(req, res, { client: 'web' });
});

router.post('/ios/query', async (req, res) => {
  await handleQuery(req, res, { client: 'ios' });
});

router.post('/api/query', async (req, res) => {
  await handleQuery(req, res, { client: 'api' });
});

export default router;
