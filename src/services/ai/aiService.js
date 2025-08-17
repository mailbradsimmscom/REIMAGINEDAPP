// src/services/ai/aiService.js
import { completeChat, embedOne } from './openaiAdapter.js';
import { getSystemPreamble } from '../policy/policy.js';

export async function completeWithPolicy({ prompt, systemExtra = '', temperature = 0.2 }) {
  const system = [getSystemPreamble(), systemExtra].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt }
  ];
  const { text } = await completeChat({ messages, temperature });
  return text;
}

export async function embedText(text) {
  return embedOne(text, { model: process.env.EMBEDDING_MODEL || 'text-embedding-3-large' });
}

export default {
  completeWithPolicy,
  embedText
};
