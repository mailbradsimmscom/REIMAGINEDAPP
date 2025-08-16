const { pineconeAdapter } = require('./pineconeAdapter');
const { openaiEmbeddingAdapter } = require('../ai/openaiEmbeddingAdapter');

/**
 * Retrieve contexts for a question.
 * Options: { topK?, namespace? }  (namespace defaults to env or __default__)
 */
async function retrieveContext(question, { topK = 5, namespace } = {}) {
  const vector = await openaiEmbeddingAdapter.embed(question);
  const ns = namespace || process.env.PINECONE_NAMESPACE || undefined;
  return pineconeAdapter.query({ vector, topK, namespace: ns });
}

module.exports = { vectorService: { retrieveContext } };
