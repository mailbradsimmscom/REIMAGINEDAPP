// src/services/responder/ai/aiCoordinator.js
// Coordinates AI service interactions for response generation

import * as ai from '../../ai/aiService.js';
import { ENV } from '../../../config/env.js';
import { cleanText } from '../processing/textProcessor.js';

if (!ENV.OPENAI_API_KEY) {
  console.warn('[ai] OPENAI_API_KEY missing — responses will be generic fallback.');
}

/**
 * Generate structured response using available AI services
 * @param {Object} params - Generation parameters
 * @param {string} params.question - User question
 * @param {string} params.contextText - Context text
 * @param {Array} params.references - Reference array
 * @param {string} params.tone - Response tone
 * @param {Array} params.assets - Asset array
 * @param {Array} params.playbooks - Playbook array
 * @param {Array} params.webSnippets - Web snippet array
 * @param {string} params.system - System preamble
 * @returns {Object|null} Generated response or null if failed
 */
export async function generateWithAI({
  question,
  contextText,
  references = [],
  tone,
  assets = [],
  playbooks = [],
  webSnippets = [],
  system
}) {
  // Prefer ai.generateStructured / generate / complete (in that order)
  const gen =
    ai.generateStructured ||
    ai.generate ||
    ai.complete ||
    (ai.default && (ai.default.generateStructured || ai.default.generate || ai.default.complete));

  // Optional: string-based helper if present
  const completion =
    ai.completeWithPolicy ||
    (ai.default && ai.default.completeWithPolicy);

  const resources = {
    assets: Array.isArray(assets) ? assets.slice(0, 2) : [],
    playbooks: Array.isArray(playbooks) ? playbooks.slice(0, 2) : [],
    web: Array.isArray(webSnippets) ? webSnippets.slice(0, 2) : []
  };

  const user = [
    `Question: ${question}`,
    `Resources:\n${JSON.stringify(resources)}`,
    `Context:\n${contextText || ''}`,
    `Return JSON: {title, summary, bullets?, cta?, raw:{text(markdown), references[]}}`
  ].join('\n\n');

  try {
    // Try structured generation first
    if (typeof gen === 'function') {
      const out = await gen({ system, user, references, tone });
      const rawText = cleanText(out?.raw?.text || '');
      
      if (rawText) {
        return {
          success: true,
          result: {
            title: out.title || 'Answer',
            summary: out.summary || '',
            bullets: Array.isArray(out.bullets) ? out.bullets : [],
            cta: out.cta ?? null,
            rawText,
            combinedRefs: [
              ...(Array.isArray(out?.raw?.references) ? out.raw.references : []),
              ...(Array.isArray(references) ? references : [])
            ]
          }
        };
      }
    }
    
    // Try completion-based generation
    if (typeof completion === 'function') {
      const prompt = [
        'You are helping a boat owner.',
        system,
        '---',
        `Question:\n${question}`,
        `Relevant context:\n${contextText || '(none)'}`,
        'Respond clearly and concisely using the policy sections.'
      ].join('\n\n');

      const aiTextRaw = await completion({ prompt, systemExtra: '', temperature: 0.2 });
      const cleaned = cleanText(String(aiTextRaw || ''));
      
      if (cleaned) {
        return {
          success: true,
          result: {
            title: 'Answer',
            summary: '',
            bullets: [],
            cta: null,
            rawText: cleaned,
            combinedRefs: Array.isArray(references) ? references : []
          }
        };
      }
    }
    
    console.warn('[responder] No AI generator function found on aiService. Falling back.');
    return { success: false, error: 'No AI generator available' };
    
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[responder] AI generation error:', e.message);
    }
    return { success: false, error: e.message };
  }
}

export default { generateWithAI };