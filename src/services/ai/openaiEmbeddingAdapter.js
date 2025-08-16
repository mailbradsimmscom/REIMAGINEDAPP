const { OpenAI } = require('openai');

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Returns a Float32Array (or plain array) embedding for given text.
 */
async function embed(text, {
  model = process.env.EMBEDDING_MODEL || 'text-embedding-3-large'
} = {}) {
  const client = createClient();
  if (!client) {
    // Mock: deterministic scalar so pipeline doesn't break; NOT semantically useful
    const base = new Array(8).fill(0).map((_, i) => ((text.charCodeAt(i % text.length) || 0) % 97) / 100);
    const dim = parseInt(process.env.VECTOR_DIM || '3072', 10);
    const out = new Array(dim);
    for (let i = 0; i < dim; i++) out[i] = base[i % base.length];
    return out;
  }
  const resp = await client.embeddings.create({
    model,
    input: text
  });
  const vec = resp.data?.[0]?.embedding || [];
  return vec;
}

module.exports = { openaiEmbeddingAdapter: { embed } };
