const { z } = require('zod');
const { aiService } = require('../services/ai/aiService');
const { vectorService } = require('../services/vector/vectorService');
const { responder } = require('../services/responder/responder');
const { serialize } = require('../views/serializers');

const bodySchema = z.object({
  question: z.string().min(1),
  metadata: z.object({
    namespace: z.string().optional()
  }).passthrough().optional()
});

async function handleQuery(req, res, next) {
  try {
    const { question, metadata } = bodySchema.parse(req.body);

    const ctx = await vectorService.retrieveContext(
      question,
      { topK: 5, namespace: metadata?.namespace }
    );

    const draft = await aiService.answerQuestion(question, ctx, { metadata });

    const styled = await responder.applyToneAndFormat(draft, {
      // legacy layout pass-through is enabled by env flag; title left null
    });

    const payload = serialize(styled, { shape: 'api' });
    res.json(payload);
  } catch (err) {
    err.status = err.status || 400;
    err.publicMessage = err.publicMessage || err.message;
    next(err);
  }
}

module.exports = { handleQuery };
