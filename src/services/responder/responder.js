// src/services/responder/responder.js
import * as ai from '../ai/aiService.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadPersona() {
  try {
    const p = readFileSync(join(process.cwd(), 'docs', 'assistant_persona_REIMAGINEDSV.md'), 'utf8');
    return String(p || '').trim();
  } catch {
    return 'You are a practical marine assistant. Be concise, specific, and procedural.';
  }
}

function loadPolicy() {
  // Response Style Policy — REIMAGINEDSV (short inline in case file missing)
  return (
`Apply this structure to every substantive answer:
In a nutshell — 2–3 concise sentences with the gist and outcome.
Tools & Materials — short bullets (omit if not relevant).
Step-by-step — numbered actions; one idea per step.
⚠️ Safety — clear cautions; short bullets.
Specs & Notes — model-specific, numbers; short bullets.
Dispose / Aftercare — cleanup/follow-up (if relevant).
What’s next — quick tailoring/validation prompt.
References — short list of sources used.

Formatting:
- Plain, active voice; short paragraphs.
- Bullets for options; numbers for procedures.
- Put confident, concrete recommendations before caveats.
- If context is insufficient, ask for one clarifying detail (one sentence max).`
  );
}

/** tiny sanitizer so UI doesn’t get PDF noise */
function clean(s = '') {
  return String(s)
    .replace(/\b(\d{1,3})\s*\|\s*Pa\s*ge\b/gi, '')
    .replace(/\bPage\s+\d+\b/gi, '')
    .replace(/·/g, '•')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n(?!\n)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** builds a deterministic, policy-shaped fallback from raw context + refs */
function synthesizeFromContext({ question, contextText, references }) {
  const ctx = clean(contextText || '');
  const snippet = ctx ? (ctx.length > 1800 ? `${ctx.slice(0, 1800)}…` : ctx) : '';

  // try to segment into “bullets” heuristically
  const lines = snippet.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const bullets = [];
  for (const l of lines) {
    if (/^\d+\./.test(l)) { bullets.push(l.replace(/^\d+\.\s*/, '')); continue; }
    if (/^[-•]\s*/.test(l)) { bullets.push(l.replace(/^[-•]\s*/, '')); continue; }
    if (bullets.length >= 10) break;
  }

  const refs = (Array.isArray(references) ? references : [])
    .slice(0, 8)
    .map(r => `• ${r.source || 'source'}${r.id ? ` — ${r.id}` : ''}`);

  const text =
`**In a nutshell**
Here’s a concise answer based on your documents and retrieved matches.

${bullets.length ? '**Step-by-step**\n' + bullets.map((b,i)=>`${i+1}. ${b}`).join('\n') : ''}

**What’s next**
Need further details or clarification?

${refs.length ? '**References**\n' + refs.join('\n') : ''}`.trim();

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

/**
 * Compose a structured answer.
 * - Tries model-generated answer with persona + policy.
 * - If empty or error, falls back to synthesized answer from context.
 */
function filterUsedReferences(text = '', refs = []) {
  const used = [];
  const body = String(text || '');
  for (const r of Array.isArray(refs) ? refs : []) {
    const id = r?.id || r?.source;
    if (!id) continue;
    if (!body.includes(String(id))) continue;
    if (used.some(u => u.id === r.id || u.source === r.source)) continue;
    used.push(r);
  }
  return used;
}

export async function composeResponse({
  question,
  contextText,
  references = [],
  tone,
  assets = [],
  playbooks = [],
  webSnippets = []
}) {
  const persona = loadPersona();
  const policy = loadPolicy();

  // prefer ai.generateStructured if present, else generate, else complete
  const gen =
    ai.generateStructured ||
    ai.generate ||
    ai.complete ||
    (ai.default && (ai.default.generateStructured || ai.default.generate || ai.default.complete));

  // Build a single prompt that includes the policy as explicit instruction
  const system = `${persona}\n\n${policy}`;
  const resources = {
    assets: Array.isArray(assets) ? assets.slice(0, 2) : [],
    playbooks: Array.isArray(playbooks) ? playbooks.slice(0, 2) : [],
    web: Array.isArray(webSnippets) ? webSnippets.slice(0, 2) : []
  };
  const user = `Question: ${question}\n\nResources:\n${JSON.stringify(resources)}\n\nContext:\n${contextText || ''}\n\nReturn: JSON with {title, summary, bullets?, cta?, raw:{text, references[]}}.`;

  try {
    if (typeof gen === 'function') {
      const out = await gen({ system, user, references, tone });
      const rawText = clean(out?.raw?.text || '');
      if (rawText) {
        const combined = [
          ...(Array.isArray(out?.raw?.references) ? out.raw.references : []),
          ...(Array.isArray(references) ? references : [])
        ];
        const finalRefs = filterUsedReferences(rawText, combined).slice(0, 12);
        return {
          title: out.title || 'Answer',
          summary: out.summary || '',
          bullets: Array.isArray(out.bullets) ? out.bullets : [],
          cta: out.cta ?? null,
          raw: {
            text: rawText,
            references: finalRefs
          }
        };
      }
    } else {
      // surface the missing export clearly
      console.warn('[responder] No AI generator function found on aiService. Falling back.');
    }
  } catch (e) {
    // Make failures obvious during dev
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[responder] AI generation error:', e.message);
    }
  }

  // Fallback: synthesize from context so the UI never gets an empty body
  const synth = synthesizeFromContext({ question, contextText, references });
  synth.raw.references = filterUsedReferences(synth.raw.text, synth.raw.references).slice(0, 12);
  return synth;
}

export default { composeResponse };
