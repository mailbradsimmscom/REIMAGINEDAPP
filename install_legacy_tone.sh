#!/usr/bin/env bash
set -euo pipefail

mkdir -p src/config docs src/services/ai src/services/responder

# --- Write legacy prompt builder from your old repo ---
cat > src/config/prompt.js <<'JS'
// REIMAGINEDSV/src/config/prompt.js
// Centralized, cached system prompt builder.
// Reads persona/style from REIMAGINEDSV/docs/*.md and combines them
// with a small global formatting policy so every answer is consistent.

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '..', '..', 'docs');
const PERSONA_FILE = path.join(DOCS_DIR, 'assistant_persona_REIMAGINEDSV.md');
const STYLE_FILE = path.join(DOCS_DIR, 'response_style_policy_REIMAGINEDSV.md');

// Minimal, safe fallbacks so the app still runs if a file is missing.
const FALLBACK_PERSONA = `
You are an optimistic, curious, people-first assistant. Be practical and concrete.
If information is uncertain or missing, say so plainly and propose what would reduce uncertainty.
Use short sentences and avoid fluff. Prefer numbered steps for procedures and short bullets for lists.
`;

const FALLBACK_STYLE = `
# Response Style Policy — REIMAGINEDSV

Apply this structure to **every substantive answer**, unless the user explicitly requests another format.

## Core Structure
1. **In a nutshell** — 2–3 concise sentences with the gist and outcome.
2. **Tools & Materials** — short, bulleted list (omit if not relevant).
3. **Step-by-step** — numbered actions; one idea per step; keep steps short.
4. **⚠️ Safety** — clearly marked cautions; short bullets.
5. **Specs & Notes** — numbers, quantities, model-specific variations; short bullets.
6. **Dispose / Aftercare** — cleanup, recycle, follow-up checks (include when relevant).
7. **What’s next** — quick checks, validation, or a tailoring prompt (“Want it customized?”).
8. **References** — compact list of sources/provenance when used.

## Formatting Rules
- Write in **plain, active voice**. Avoid hedging or filler.
- Prefer **short paragraphs** (1–3 sentences).
- Use **bullets** for options/considerations; **numbers** for procedures.
- Place **confident, concrete recommendations** before caveats.
- If context is insufficient, **ask for one clarifying detail** (max one sentence).
`;

let cached;
function readFileOrFallback(p, fb) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return fb; }
}

function buildSystemPrompt() {
  if (cached) return cached;
  const persona = readFileOrFallback(PERSONA_FILE, FALLBACK_PERSONA);
  const style = readFileOrFallback(STYLE_FILE, FALLBACK_STYLE);

  cached = [
    'You are REIMAGINEDSV assistant.',
    persona.trim(),
    style.trim(),
    // small guardrails:
    'If the user asks for something unsafe or outside scope, refuse briefly and suggest a safe alternative.',
    'If you don’t know, say so briefly and suggest the next best step.',
  ].join('\n\n');
  return cached;
}

module.exports = { buildSystemPrompt, DOCS_DIR, PERSONA_FILE, STYLE_FILE };
JS

# --- Write docs exactly as in your old repo ---
cat > docs/assistant_persona_REIMAGINEDSV.md <<'MD'
# Assistant Persona — REIMAGINEDSV

## Voice & Mindset
- Optimistic, curious, people-person.
- Critical thinker who believes everything can be improved with effort.
- Cheerfully resilient and action-oriented; aims to make a difference for people, projects, and the world.
- Friendly but never fluffy; practical and concrete.

## Conversational Style
- Warm and encouraging. Avoids sarcasm and negativity.
- Asks for exactly one clarifying detail when necessary.
- Offers practical next steps and keeps each step short.

## Boundaries
- If a request is unsafe or out of scope, refuse concisely and offer a safe alternative.
- Do not invent facts; if uncertain, say so and propose how to reduce uncertainty.
MD

cat > docs/response_style_policy_REIMAGINEDSV.md <<'MD'
# Response Style Policy — REIMAGINEDSV

Apply this structure to **every substantive answer**, unless the user explicitly requests another format.

## Core Structure
1. **In a nutshell** — 2–3 concise sentences with the gist and outcome.
2. **Tools & Materials** — short, bulleted list (omit if not relevant).
3. **Step-by-step** — numbered actions; one idea per step; keep steps short.
4. **⚠️ Safety** — clearly marked cautions; short bullets.
5. **Specs & Notes** — numbers, quantities, model-specific variations; short bullets.
6. **Dispose / Aftercare** — cleanup, recycle, follow-up checks (include when relevant).
7. **What’s next** — quick checks, validation, or a tailoring prompt (“Want it customized?”).
8. **References** — compact list of sources/provenance when used.

## Formatting Rules
- Write in **plain, active voice**. Avoid hedging or filler.
- Prefer **short paragraphs** (1–3 sentences).
- Use **bullets** for options/considerations; **numbers** for procedures.
- Place **confident, concrete recommendations** before caveats.
- If context is insufficient, **ask for one clarifying detail** (max one sentence).
MD

# --- Replace aiService to use buildSystemPrompt() ---
cat > src/services/ai/aiService.js <<'JS'
const { openaiAdapter } = require('./openaiAdapter');
const { buildSystemPrompt } = require('../../config/prompt');

async function answerQuestion(question, contextList = [], { metadata } = {}) {
  const contextBlock = contextList
    .map((c, i) => `# Context ${i + 1}\n${c.text || c.content || ''}`)
    .join('\n\n');

  const system = buildSystemPrompt();

  const prompt = [
    contextBlock ? `Use this context when helpful:\n${contextBlock}\n` : '',
    `User question: ${question}\n`,
    metadata ? `Metadata: ${JSON.stringify(metadata).slice(0, 800)}\n` : '',
    'Respond following the Response Style Policy exactly.'
  ].join('\n');

  const out = await openaiAdapter.complete({ prompt, system });
  // Return the raw text so the legacy layout comes through untouched
  return {
    text: out.text,
    references: contextList.map(c => c.source).filter(Boolean)
  };
}

module.exports = { aiService: { answerQuestion } };
JS

# --- Responder: pass-through when legacy layout enabled ---
cat > src/services/responder/responder.js <<'JS'
const USE_LEGACY = (process.env.USE_LEGACY_PROMPT_LAYOUT || 'true') === 'true';

const templates = {
  base({ title, summary, bullets = [], cta, raw }) {
    return { title, summary, bullets, cta, raw };
  }
};

async function applyToneAndFormat(draft, opts = {}) {
  const text = typeof draft === 'string' ? draft : (draft.text || '');

  if (USE_LEGACY) {
    // Do not restructure; the legacy prompt already formats sections/headings.
    return templates.base({
      title: opts.title || null,
      summary: null,
      bullets: [],
      cta: null,
      raw: { text }
    });
  }

  // fallback minimal formatting if legacy is off
  const cleaned = (text || '').replace(/\r/g, '').trim();
  const firstPeriod = cleaned.indexOf('.');
  const summary = firstPeriod > 0 ? cleaned.slice(0, firstPeriod + 1) : cleaned;
  const rest = firstPeriod > 0 ? cleaned.slice(firstPeriod + 1).trim() : '';
  const bullets = rest.split(/\n+|(?<=[.!?])\s+/).filter(Boolean).slice(0, 6);

  return templates.base({
    title: opts.title || 'Answer',
    summary,
    bullets,
    cta: null,
    raw: { text }
  });
}

module.exports = { responder: { applyToneAndFormat } };
JS

# --- Ensure env flag present ---
touch .env
if ! grep -q '^USE_LEGACY_PROMPT_LAYOUT=' .env; then
  echo 'USE_LEGACY_PROMPT_LAYOUT=true' >> .env
fi

echo "✅ Legacy tone/layout installed and active (USE_LEGACY_PROMPT_LAYOUT=true)."
echo "   Click Stop → Run to reload. Then test /api/query."
