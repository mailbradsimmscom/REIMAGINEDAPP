// src/services/ai/openaiAdapter.js
// ESM OpenAI adapter: chat completion + embeddings (semantic cache relies on embedOne)

import OpenAI from 'openai';

const DEFAULT_CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
const VECTOR_DIM = Number(process.env.VECTOR_DIM || 3072); // Pinecone index is 3072-dim

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Chat completion (simple wrapper).
 * Returns { text }.
 */
export async function complete({ prompt, system, temperature = 0.3, model = DEFAULT_CHAT_MODEL }) {
  const client = getClient();
  if (!client) {
    // Safe mock to avoid blocking local dev when key missing
    const mock = `MOCK (no OPENAI_API_KEY): ${String(prompt || '').slice(0, 180)}...`;
    return { text: mock };
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: String(prompt || '') });

  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature
  });

  const text = resp?.choices?.[0]?.message?.content ?? '';
  return { text };
}

/**
 * Generate a 3072-d embedding for a single string using OpenAI.
 * Returns a plain Number[] (length == VECTOR_DIM).
 *
 * If OPENAI_API_KEY is missing, returns a deterministic mock embedding
 * so dev flows (semantic cache) can proceed without real calls.
 */
export async function embedOne(text) {
  const s = String(text ?? '').trim();
  if (!s) return [];

  const client = getClient();
  if (!client) {
    // Deterministic mock: seeded pseudo-random vector with unit-ish norm
    return mockEmbedding(s, VECTOR_DIM);
  }

  const resp = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: s
  });

  const vec = resp?.data?.[0]?.embedding || [];
  // Safety: enforce numeric array and expected dim (some providers vary)
  return Array.isArray(vec) ? vec.map(Number).slice(0, VECTOR_DIM) : [];
}

/* ------------------------ helpers ------------------------ */

/**
 * Deterministic mock embedding for local dev without API key.
 * Uses a simple xorshift32 on a string hash to fill VECTOR_DIM numbers in [-0.5, 0.5].
 */
function mockEmbedding(seedText, dim) {
  let h = 2166136261 >>> 0; // FNV-1a basis
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // xorshift32 generator
  function rnd() {
    let x = h || 1;
    x ^= x << 13; x >>>= 0;
    x ^= x << 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    h = x >>> 0;
    // map to [-0.5, 0.5]
    return (x / 0xffffffff) - 0.5;
  }
  const v = new Array(dim);
  for (let i = 0; i < dim; i++) v[i] = rnd();
  return v;
}

export default { complete, embedOne };
