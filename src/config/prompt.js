// REIMAGINEDSV/src/config/prompt.js
// Centralized, cached system prompt builder.
// Reads persona/style from REIMAGINEDSV/docs/*.md and combines them
// with a small global formatting policy so every answer is consistent.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

export function buildSystemPrompt() {
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

export { DOCS_DIR, PERSONA_FILE, STYLE_FILE };
