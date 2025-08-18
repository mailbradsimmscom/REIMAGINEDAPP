// src/services/responder/responder.js
import * as ai from '../ai/aiService.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadPersona() {
  try {
    const p = readFileSync(join(process.cwd(), 'docs', 'assistant_persona_REIMAGINEDSV.md'), 'utf8');
    return String(p || '').trim();
  } catch {
    return 'You are a practical marine assistant.';
  }
}

/**
 * Style policy: instruct the model to answer plainly—no headings or canned sections.
 * This stops "In a nutshell / Step-by-step / What’s next" formatting.
 */
function loadPolicy() {
  return [
    'Answer in plain, concise paragraphs.',
    'Do NOT add headings or section labels (e.g., "In a nutshell", "Step-by-step", "What’s next").',
    'Do not prepend summaries unless explicitly asked.',
    'Use bullet lists ONLY if the user requests steps or a checklist.',
    'If references are included in the prompt, you may cite them inline briefly; otherwise do not invent citations.'
  ].join('\n');
}

function buildPrompt({ persona, policy, question, contextText, references }) {
  const refList = Array.isArray(references) && references.length
    ? `\n\nReferences:\n${references.map((r,i)=>`  [${i+1}] ${r.source || r.id || 'ref'}`).join('\n')}`
    : '';

  return [
    `Persona:\n${persona}`,
    `Style Policy:\n${policy}`,
    contextText ? `Context:\n${contextText}` : '',
    `User question:\n${question}`,
    refList,
    '\nRespond directly to the user question. Keep it plain.'
  ].filter(Boolean).join('\n\n');
}

export async function composeResponse({ question, contextText = '', references = [], tone, client = 'web' }) {
  const persona = loadPersona();
  const policy  = loadPolicy();

  let text;
  try {
    const prompt = buildPrompt({ persona, policy, question, contextText, references });
    text = await ai.completeWithPolicy({ prompt, temperature: 0.2 });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.warn('[responder] AI generation error:', e.message);
    text = contextText || 'Sorry, I could not generate an answer.';
  }

  return {
    title: null,
    summary: null,
    bullets: [],
    cta: null,
    raw: { text, references }
  };
}

export default { composeResponse };
