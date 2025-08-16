const { z } = require('zod');
const { aiService } = require('../services/ai/aiService');
const { vectorService } = require('../services/vector/vectorService');
const { responder } = require('../services/responder/responder');
const { serialize } = require('../views/serializers');

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

module.exports = { handleQuery, handleQueryWeb, handleQueryIos, handleQueryFactory };
