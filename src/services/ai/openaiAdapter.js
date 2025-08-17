// src/services/ai/openaiAdapter.js
import OpenAI from 'openai';

function makeClient() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function completeChat({ messages, model = 'gpt-4o-mini', temperature = 0.2 }) {
  const client = makeClient();
  if (!client) {
    // Dev mock to keep flow unblocked
    const userMsg = messages.find(m => m.role === 'user')?.content || '';
    return { text: `MOCK: ${String(userMsg).slice(0, 200)}...` };
  }
  const resp = await client.chat.completions.create({
    model,
    temperature,
    messages
  });
  const text = resp.choices?.[0]?.message?.content?.trim() || '';
  return { text };
}

export async function embedOne(text, { model = 'text-embedding-3-large' } = {}) {
  const client = makeClient();
  if (!client) {
    // Return tiny fake vector so pipelines don't crash in dev
    return { vector: Array(16).fill(0.001) };
  }
  const r = await client.embeddings.create({ model, input: text });
  const vector = r.data?.[0]?.embedding || [];
  return { vector };
}
