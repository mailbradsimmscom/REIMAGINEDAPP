const { z } = require('zod');
const { aiService } = require('../services/ai/aiService');
const { vectorService } = require('../services/vector/vectorService');
const { responder } = require('../services/responder/responder');
const { serialize } = require('../views/serializers');

const bodySchema = z.object({
  question: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

// Factory so we can create handlers with a default shape (api/web/ios)
function handleQueryFactory(defaultShape = 'api') {
  return async function handleQuery(req, res, next) {
    try {
      const { question, metadata } = bodySchema.parse(req.body);
      const shape = (req.query.shape || defaultShape).toString();

      // 1) Retrieve relevant context
      const ctx = await vectorService.retrieveContext(question, { topK: 5 });

      // 2) Draft from AI
      const draft = await aiService.answerQuestion(question, ctx, { metadata });

      // 3) Centralized tone/format
      const styled = await responder.applyToneAndFormat(draft, {
        tone: 'professional-conversational',
        audience: 'general',
        constraints: { maxSentences: 12, avoid: ['hedging', 'purple prose'] }
      });

      // 4) Serialize for shape
      const payload = serialize(styled, { shape });
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
