// src/services/responder/fallback/fallbackSynthesis.js
// Handles fallback response synthesis from context and references

import { cleanText } from '../processing/textProcessor.js';
import { applyPolicyEnforcement } from '../policy/policyEnforcer.js';

/**
 * Synthesize fallback response from context and references
 * @param {Object} params - Synthesis parameters
 * @param {string} params.contextText - Context text to synthesize from
 * @param {Array} params.references - Reference array
 * @returns {Object} Synthesized response structure
 */
export function synthesizeFromContext({ contextText, references }) {
  const ctx = cleanText(contextText || '');
  const snippet = ctx ? (ctx.length > 1800 ? `${ctx.slice(0, 1800)}…` : ctx) : '';

  const lines = snippet.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const bullets = [];
  
  for (const line of lines) {
    if (/^\d+\./.test(line)) { 
      bullets.push(line.replace(/^\d+\.\s*/, '')); 
      continue; 
    }
    if (/^[-•]\s*/.test(line)) { 
      bullets.push(line.replace(/^[-•]\s*/, '')); 
      continue; 
    }
    if (bullets.length >= 10) break;
  }

  const refs = (Array.isArray(references) ? references : [])
    .slice(0, 8)
    .map(r => {
      const title = r?.title || r?.model_key || [r?.manufacturer, r?.description].filter(Boolean).join(' ');
      return `• ${r.source || 'source'}${title ? ` — ${title}` : ''}`;
    });

  const rough = [
    '**In a nutshell**',
    'Here\'s a concise answer based on your documents and retrieved matches.',
    bullets.length ? '\n**Step-by-step**\n' + bullets.map((b,i)=>`${i+1}. ${b}`).join('\n') : '',
    '\n**What\'s next**',
    'Need further details or clarification?',
    refs.length ? '\n**References**\n' + refs.join('\n') : ''
  ].join('\n').trim();

  const text = applyPolicyEnforcement(rough);
  
  return {
    title: 'Answer',
    summary: bullets.slice(0,2).join(' ').slice(0, 200),
    bullets: [],
    cta: null,
    raw: {
      text,
      references: (Array.isArray(references) ? references : []).slice(0, 8)
    }
  };
}

export default { synthesizeFromContext };