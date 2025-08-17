// src/services/ai/aiService.js
import { embedText, chatComplete } from './openaiAdapter.js';

/**
 * Return a plain embedding vector (array of numbers) for a single text.
 * Mixer expects this shape.
 */
export async function embed(text) {
  const { vector } = await embedText(text);
  return Array.isArray(vector) ? vector : [];
}

/**
 * Return just the completion string (the responder composes structure).
 */
export async function complete({ prompt, system, temperature, model }) {
  const { text } = await chatComplete({ system, user: prompt, temperature, model });
  return text;
}

export default { embed, complete };
