import { z } from 'zod';
import aiService from '../services/ai/aiService.js';
import * as vectorService from '../services/vector/vectorService.js';
import responder from '../services/responder/responder.js';
import { serialize } from '../views/serializers.js';

const bodySchema = z.object({
  question: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

function handleQueryFactory(defaultShape = 'api') {
  return async function handleQuery(req, res, next) {
    try {
      const { question, metadata } = bodySchema.parse(req.body);
      const ns = metadata?.namespace;
      const ctx = await vectorService.retrieveContext(question, { topK: 5, namespace: ns });

      const draft = await aiService.answerQuestion(question, ctx, { metadata });

      const styled = await responder.applyToneAndFormat(draft, {
        // legacy layout pass-through is handled by responder env
      });

      const payload = serialize(styled, { shape: defaultShape });
      res.json(payload);
    } catch (err) {
      err.status = err.status || 400;
      err.publicMessage = err.publicMessage || err.message;
      next(err);
    }
  };
}

const handleQuery = handleQueryFactory('api');
const handleQueryWeb = handleQueryFactory('web');
const handleQueryIos = handleQueryFactory('ios');

export { handleQuery, handleQueryWeb, handleQueryIos, handleQueryFactory };
