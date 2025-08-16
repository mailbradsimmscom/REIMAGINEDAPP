// src/services/ai/openaiAdapter.js
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY || '';
const client = apiKey ? new OpenAI({ apiKey }) : null;

const DEFAULT_EMBED_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
const VECTOR_DIM = Number(process.env.VECTOR_DIM || 3072);

/**
 * Create embeddings for an array of strings.
 * Returns { vectors: number[][], model, dim }
 */
export async function embedBatch(texts, { model = DEFAULT_EMBED_MODEL } = {}) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return { vectors: [], model, dim: VECTOR_DIM };
  }

  // no-key fallback (dev): return tiny random vectors to keep code paths alive
  if (!client) {
    const vectors = texts.map(() =>
      Array.from({ length: VECTOR_DIM }, () => Math.random() * 0.01)
    );
    return { vectors, model, dim: VECTOR_DIM, mock: true };
  }

  const resp = await client.embeddings.create({
    input: texts,
    model
  });

  const vectors = resp.data.map(e => e.embedding);
  return { vectors, model, dim: vectors[0]?.length || VECTOR_DIM };
}

/**
 * Convenience single-text embed → number[]
 */
export async function embedOne(text, opts = {}) {
  const { vectors } = await embedBatch([text], opts);
  return vectors[0] || [];
}
