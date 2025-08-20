// src/services/responder/responder.js
import * as ai from '../ai/aiService.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ENV } from '../../config/env.js';

if (!ENV.OPENAI_API_KEY) {
  console.warn('[ai] OPENAI_API_KEY missing — responses will be generic fallback.');
}

function loadPersona() {
  try {
    const p = readFileSync(join(process.cwd(), 'docs', 'assistant_persona_REIMAGINEDSV.md'), 'utf8');
    return String(p || '').trim();
  } catch {
    return 'You are a practical marine assistant. Be concise, specific, and procedural.';
  }
}

/**
 * Prefer an external policy file so writers can edit without touching code:
 *   docs/assistant_policy_REIMAGINEDSV.md
 * If missing, use a strong inline fallback that enforces anchoring.
 */
function loadPolicy() {
  const policyPath = join(process.cwd(), 'docs', 'assistant_policy_REIMAGINEDSV.md');
  if (existsSync(policyPath)) {
    try {
      const p = readFileSync(policyPath, 'utf8');
      const s = String(p || '').trim();
      if (s) return s;
    } catch {/* ignore and fall back */}
  }
  return (
`Response structure (use exactly these section names when relevant):
In a nutshell — 2–3 sentences with the key answer.
Tools & Materials — concise bullets (omit if irrelevant).
Step-by-step — numbered steps tailored to the user's boat.
⚠️ Safety — concrete cautions; short bullets.
Specs & Notes — model-specific numbers & facts from the provided resources.
Dispose / Aftercare — cleanup/follow-up (omit if N/A).
What’s next — one short prompt to continue.
References — list the sources you used.

CRITICAL ANCHORING RULES:
- If 'assets' or 'playbooks' are provided, you MUST reference them by name (manufacturer + model OR playbook title) in the body.
- Pull 2–3 model-specific specs from the provided resources (e.g., interface, voltage, frequency, mounting).
- Prefer boat inventory over generalities. If multiple items fit, focus on the top 1–2 with highest relevance.
- If no relevant resources are provided, state that briefly, then give a general best-practice answer.

Style:
- Plain, active voice; concise; procedural.
- No filler; avoid generic “what is …” unless no resources exist.
- Do not invent specs. Only use facts appearing in the provided resources.`
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

/** human-friendly label for a reference (avoid UUIDs in the fallback text) */
function refLabel(r = {}) {
  const source = r.source || 'ref';
  const title = r.title || r.description || null;
  const mfg = r.manufacturer || null;
  const mk = r.model_key || null;
  const desc = title || mk || (mfg ? `${mfg}` : null);
  return desc ? `${source} — ${desc}` : source;
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

  const refsArr = (Array.isArray(references) ? references : []).slice(0, 8);
  const refsLines = refsArr.map(r => `• ${refLabel(r)}`);

  const text =
`**In a nutshell**
Here’s a concise answer based on your documents and retrieved matches.

${bullets.length ? '**Step-by-step**\n' + bullets.map((b,i)=>`${i+1}. ${b}`).join('\n') : ''}

**What’s next**
Need further details or clarification?

${refsLines.length ? '**References**\n' + refsLines.join('\n') : ''}`.trim();

  return {
    title: 'Answer',
    summary: bullets.slice(0,2).join(' ').slice(0, 200),
    bullets: [],
    cta: null,
    raw: {
      text,
      references: refsArr
    }
  };
}

/**
 * Keep refs that the model actually used, but match by
 *   - id (UUID) OR title OR model_key
 * so we don't require UUIDs to appear in the prose.
 */
function filterUsedReferences(text = '', refs = []) {
  const body = String(text || '').toLowerCase();
  const seen = new Set();
  const out = [];

  for (const r of Array.isArray(refs) ? refs : []) {
    const id = String(r?.id || '').toLowerCase();
    const title = String(r?.title || r?.description || '').toLowerCase();
    const mk = String(r?.model_key || '').toLowerCase();

    const matched =
      (id && body.includes(id)) ||
      (title && body.includes(title)) ||
      (mk && body.includes(mk));

    if (!matched) continue;
    const key = r.id || r.title || r.model_key || `${r.source}-${out.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** detect if the answer anchored to concrete boat items */
function looksAnchored(text = '', assets = [], playbooks = []) {
  const body = String(text || '').toLowerCase();
  const needles = [];

  for (const a of assets || []) {
    if (a?.manufacturer) needles.push(String(a.manufacturer).toLowerCase());
    if (a?.description)  needles.push(String(a.description).toLowerCase());
    if (a?.model_key)    needles.push(String(a.model_key).toLowerCase());
    if (a?.title)        needles.push(String(a.title).toLowerCase());
  }
  for (const p of playbooks || []) {
    if (p?.title)     needles.push(String(p.title).toLowerCase());
    if (p?.model_key) needles.push(String(p.model_key).toLowerCase());
  }
  return needles.some(n => n && body.includes(n));
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

  // Prefer higher-level generators if they exist
  const gen =
    ai.generateStructured ||
    ai.generate ||
    ai.complete ||
    (ai.default && (ai.default.generateStructured || ai.default.generate || ai.default.complete));

  // existing completion helper (if present)
  const completion =
    ai.completeWithPolicy ||
    (ai.default && ai.default.completeWithPolicy);

  // Build shared prompt parts
  const system = `${persona}\n\n${policy}`;
  const resources = {
    // give the model enough to anchor
    assets: Array.isArray(assets) ? assets.slice(0, 4) : [],
    playbooks: Array.isArray(playbooks) ? playbooks.slice(0, 4) : [],
    web: Array.isArray(webSnippets) ? webSnippets.slice(0, 2) : []
  };

  const baseUser =
`Question: ${question}

Resources:
${JSON.stringify(resources)}

Context:
${contextText || ''}

Return: JSON with {title, summary, bullets?, cta?, raw:{text, references[]}}.`;

  try {
    if (typeof gen === 'function') {
      // ---------- Pass 1
      let out = await gen({ system, user: baseUser, references, tone });
      let rawText = clean(out?.raw?.text || '');

      // ---------- If generic, force anchoring with a second pass
      if (rawText && !looksAnchored(rawText, resources.assets, resources.playbooks)) {
        const userAnchored =
`${baseUser}

MANDATORY: Explicitly name and use the provided boat resources (assets/playbooks).
Include 2–3 model-specific specs (numbers/standards) pulled from THOSE resources.
Do NOT provide a generic primer.`;

        const out2 = await gen({ system, user: userAnchored, references, tone });
        const rawText2 = clean(out2?.raw?.text || '');
        if (rawText2) { out = out2; rawText = rawText2; }
      }

      if (rawText) {
        const combined = [
          ...(Array.isArray(out?.raw?.references) ? out.raw.references : []),
          ...(Array.isArray(references) ? references : [])
        ];
        // allow title/model_key matches, not only UUIDs
        let finalRefs = filterUsedReferences(rawText, combined).slice(0, 12);
        // if the model didn’t echo any identifiers, keep at least a couple refs
        if (finalRefs.length === 0 && combined.length) finalRefs = combined.slice(0, 4);

        return {
          title: out.title || 'Answer',
          summary: out.summary || '',
          bullets: Array.isArray(out.bullets) ? out.bullets : [],
          cta: out.cta ?? null,
          assets,
          playbooks,
          webSnippets,
          raw: {
            text: rawText,
            references: finalRefs
          }
        };
      }
    } else if (typeof completion === 'function') {
      // Fallback to string completion path (kept for compatibility)
      const prompt =
`You are helping a boat owner.

${system}

Question:
${question}

Relevant context:
${contextText || '(none)'}

References:
${
  (Array.isArray(references) ? references : [])
    .slice(0, 8)
    .map(r => `• ${refLabel(r)}`)
    .join('\n') || '(none)'
}

Tone: ${tone || 'neutral, clear'}

Respond clearly and concisely.`;
      const aiTextRaw = await completion({ prompt, systemExtra: '', temperature: 0.2 });
      const aiText = clean(typeof aiTextRaw === 'string' ? aiTextRaw : String(aiTextRaw || ''));

      const finalRefs = (Array.isArray(references) ? references : []).slice(0, 12);

      return {
        title: 'Answer',
        summary: '',
        bullets: [],
        cta: null,
        assets,
        playbooks,
        webSnippets,
        raw: {
          text: aiText + (finalRefs.length ? `\n\n**References**\n` + finalRefs.map(r => `• ${refLabel(r)}`).join('\n') : ''),
          references: finalRefs
        }
      };
    } else {
      console.warn('[responder] No AI generator function found on aiService. Falling back.');
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[responder] AI generation error:', e.message);
    }
  }

  // Deterministic fallback
  const synth = synthesizeFromContext({ question, contextText, references });
  synth.raw.references = filterUsedReferences(synth.raw.text, synth.raw.references).slice(0, 12);
  if (synth.raw.references.length === 0 && Array.isArray(references) && references.length) {
    synth.raw.references = references.slice(0, 4);
  }
  return { ...synth, assets, playbooks, webSnippets };
}

export default { composeResponse };
