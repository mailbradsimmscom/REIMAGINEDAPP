// src/services/policy/policy.js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

function safeRead(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

const PERSONA_PATH = path.join(ROOT, 'docs', 'assistant_persona_REIMAGINEDSV.md');
const STYLE_PATH   = path.join(ROOT, 'docs', 'response_style_policy_REIMAGINEDSV.md');

const PERSONA_MD = safeRead(PERSONA_PATH).trim();
const STYLE_MD   = safeRead(STYLE_PATH).trim();

// --- System preamble (reads your .md files) ---------------------------------
export function getSystemPreamble() {
  return [
    'You are REIMAGINEDSV assistant.',
    PERSONA_MD && `## Assistant Persona\n${PERSONA_MD}`,
    STYLE_MD && `## Response Style Policy\n${STYLE_MD}`,
    'Always follow the policy and produce only the sections that apply, in the specified order.',
    'Never include extraneous content outside those sections.',
  ].filter(Boolean).join('\n\n');
}

// --- Policy enforcement / sanitation ----------------------------------------
export const POLICY_ORDER = [
  'In a nutshell',
  'Tools & Materials',
  'Step-by-step',
  '⚠️ Safety',
  'Specs & Notes',
  'Dispose / Aftercare',
  "What’s next",
  'References'
];

// loose heading patterns: accept **Heading**, # Heading, or "Heading:"
const H_PAT = POLICY_ORDER.map(h => ({
  label: h,
  re: new RegExp(`^(?:\\*\\*\\s*)?${h.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}(?:\\s*\\*\\*)?\\s*:?$`, 'i')
}));

function splitBlocks(md) {
  return String(md || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}
function isHeadingLine(s) {
  return /^(\*{2}[^*]+\*{2}|#{1,3}\s+.+|[A-Z].+?:\s*)$/.test(s.trim());
}
function normalizeHeadingText(s) {
  let t = s.trim();
  t = t.replace(/^#{1,3}\s+/, '');
  t = t.replace(/^\*\*(.+?)\*\*$/, '$1');
  t = t.replace(/:\s*$/, '');
  return t;
}

/**
 * Enforce the policy section order, discard junk outside, and normalize sections.
 * Any content that isn't under one of the allowed headings is dropped.
 */
export function enforcePolicySections(md) {
  const blocks = splitBlocks(md);
  const sections = new Map(POLICY_ORDER.map(h => [h, []]));
  let current = null;

  for (const b of blocks) {
    // heading?
    if (isHeadingLine(b)) {
      const h = normalizeHeadingText(b);
      const match = H_PAT.find(({ re }) => re.test(h));
      current = match ? match.label : null;
      continue;
    }
    // keep only content under a recognized heading
    if (current && sections.has(current)) {
      sections.get(current).push(b);
    }
  }

  // Normalize lists: ensure each bullet/step is on its own line
  function normalizeList(text) {
    let s = text;
    s = s.replace(/\s+(\d+)\.\s+/g, '\n$1. ');
    s = s.replace(/\s+•\s+/g, '\n• ');
    return s.trim();
  }

  // Rebuild in correct order; cap lengths to keep answers tight
  const parts = [];
  for (const h of POLICY_ORDER) {
    const body = (sections.get(h) || []).join('\n\n').trim();
    if (!body) continue;

    let cleaned = normalizeList(body);

    // Section-specific caps (soft limits)
    if (h === 'In a nutshell') {
      const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
      cleaned = sentences;
    }
    if (h === 'Step-by-step') {
      const lines = cleaned.split('\n').filter(Boolean);
      const limited = [];
      for (const ln of lines) {
        if (/^\d+\.\s+/.test(ln)) limited.push(ln);
        if (limited.length >= 12) break;
      }
      cleaned = limited.join('\n');
    }
    if (h === 'Tools & Materials' || h === 'Specs & Notes' || h === '⚠️ Safety') {
      const lines = cleaned.split('\n').filter(l => /^•\s+/.test(l)).slice(0, 10);
      cleaned = lines.join('\n');
    }
    if (h === 'References') {
      // placeholder; responder will provide concrete refs
      cleaned = cleaned || '• (see retrieval sources below)';
    }

    parts.push(`**${h}**\n${cleaned}`);
  }

  return parts.join('\n\n').trim();
}
