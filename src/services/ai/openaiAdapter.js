// src/services/ai/openaiAdapter.js
import OpenAI from 'openai';

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

/**
 * Create embeddings for text (or array of texts).
 * Returns a single vector for the first item (the mixer uses single text).
 */
export async function embedText(
  text,
  { model = process.env.EMBEDDING_MODEL || 'text-embedding-3-large' } = {}
) {
  const client = createClient();
  const input = Array.isArray(text) ? text : [text];

  if (!client) {
    // graceful mock to keep dev flow unblocked
    return { vector: [], model, provider: 'openai', mock: true };
  }

  const resp = await client.embeddings.create({ model, input });
  const vec = resp?.data?.[0]?.embedding || [];
  return { vector: vec, model, provider: 'openai', mock: false };
}

/**
 * Simple chat completion wrapper.
 */
export async function chatComplete({
  system,
  user,
  temperature = 0.3,
  model = process.env.OPENAI_MODEL || 'gpt-4o-mini',
}) {
  const client = createClient();
  if (!client) {
    return {
      text: `MOCK: ${String(user || '').slice(0, 120)}...`,
      model,
      provider: 'openai',
      mock: true,
    };
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user || '' });

  const resp = await client.chat.completions.create({
    model,
    messages,
    temperature,
  });

  const text = resp?.choices?.[0]?.message?.content || '';
  return { text, model, provider: 'openai', mock: false };
}

export default { embedText, chatComplete };
