// ESM adapter for OpenAI chat + embeddings
import OpenAI from 'openai';
import { AIGenerationError } from '../../utils/errors.js';

const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_EMBED = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
const MODEL_CHAT  = process.env.CHAT_MODEL || 'gpt-4o-mini';

function clientOrNull() {
  return API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;
}

/** Chat completion (keeps your surface) */
export async function completeChat({ messages, model = MODEL_CHAT, temperature = 0.2 }) {
  const client = clientOrNull();
  if (!client) {
    const u = messages.find(m => m.role === 'user')?.content || '';
    return { text: `MOCK: ${String(u).slice(0, 180)}...` };
  }
  
  try {
    const r = await client.chat.completions.create({ model, temperature, messages });
    const text = r.choices?.[0]?.message?.content?.trim() || '';
    return { text };
  } catch (error) {
    throw new AIGenerationError('Chat completion failed', 'openai', model, error);
  }
}

/** Single string embedding (keeps your surface) */
export async function embedOne(text, { model = MODEL_EMBED } = {}) {
  const client = clientOrNull();
  if (!client) return { vector: Array(16).fill(0.001) };
  
  try {
    const r = await client.embeddings.create({ model, input: text });
    return { vector: r.data?.[0]?.embedding || [] };
  } catch (error) {
    throw new AIGenerationError('Text embedding failed', 'openai', model, error);
  }
}

/** NEW: batch embeddings */
export async function embedBatch(strings, { model = MODEL_EMBED } = {}) {
  if (!Array.isArray(strings) || strings.length === 0) return [];
  const client = clientOrNull();
  if (!client) return strings.map(() => Array(16).fill(0.001));
  
  try {
    const r = await client.embeddings.create({ model, input: strings });
    return (r.data || []).map(d => d.embedding);
  } catch (error) {
    throw new AIGenerationError('Batch embedding failed', 'openai', model, error);
  }
}

/** NEW: query embedding */
export async function embedQuery(q, { model = MODEL_EMBED } = {}) {
  const arr = await embedBatch([q], { model });
  return arr[0] || [];
}

export default { completeChat, embedOne, embedBatch, embedQuery };
