// src/services/responder/responder.js
// Turns raw context into a structured answer with tone-aware formatting

import { pickTone } from './presets.js';

/**
 * shape:
 * {
 *   title: string|null,
 *   summary: string|null,
 *   bullets: string[],
 *   cta: { label, action } | null,
 *   raw: { text: string, references: Array<{id, score, source, text}> }
 * }
 */
function emptyShape() {
  return {
    title: null,
    summary: null,
    bullets: [],
    cta: null,
    raw: { text: '', references: [] },
  };
}

function toTitle(s) {
  if (!s) return null;
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

// Lightweight bullet extraction from a paragraph-ish text.
// If lines already look like bullets/numbers, keep them; else split by sentences.
function extractBullets(text, max = 5) {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  let bullets = [];
  if (lines.some(l => /^[-•*]\s+/.test(l) || /^\d+\./.test(l))) {
    bullets = lines
      .filter(l => /^[-•*]\s+/.test(l) || /^\d+\./.test(l))
      .map(l => l.replace(/^[-•*]\s+/, '').trim());
  } else {
    // naive sentence split
    bullets = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // de-dup and limit
  const seen = new Set();
  const uniq = [];
  for (const b of bullets) {
    const k = b.toLowerCase();
    if (!seen.has(k)) {
      uniq.push(b);
      seen.add(k);
    }
    if (uniq.length >= max) break;
  }
  return uniq;
}

function makeCta(tone, question) {
  if (!tone?.includeCta) return null;
  const q = (question || '').trim();
  return {
    label: 'Want more detail?',
    action: q ? `Refine: ${q}` : 'Refine this answer',
  };
}

/**
 * Compose a structured response.
 * @param {object} params
 *  - question: string
 *  - contextText: string // concatenated retrieved chunks (step 3 will supply)
 *  - references: Array<{id, score, source, text}>
 *  - tone: 'concise' | 'coach' | 'hands_on'
 */
export function composeResponse({ question, contextText, references = [], tone = 'concise' }) {
  const preset = pickTone(tone);
  const out = emptyShape();

  // Title
  out.title = toTitle(question) || 'Answer';

  // Summary (tone-aware)
  const baseSummary = contextText && contextText.length > 0
    ? `In short: ${contextText.split(/\r?\n/)[0].trim()}`
    : 'No specific context found.';

  if (preset.name === 'concise') {
    out.summary = baseSummary.replace(/^In short:\s*/i, '');
  } else if (preset.name === 'hands_on') {
    out.summary = 'Here’s the practical gist: ' + baseSummary.replace(/^In short:\s*/i, '');
  } else {
    // coach
    out.summary = 'Big picture: ' + baseSummary.replace(/^In short:\s*/i, '');
  }

  // Bullets (tone-aware)
  const maxBullets = preset.bulletsMax || 5;
  out.bullets = extractBullets(contextText, maxBullets);

  // CTA
  out.cta = makeCta(preset, question);

  // Raw
  out.raw.text = contextText || '';
  out.raw.references = Array.isArray(references) ? references : [];

  return out;
}
