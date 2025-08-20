// src/services/responder/responder.js
import * as ai from '../ai/aiService.js';
import { ENV } from '../../config/env.js';
import { getSystemPreamble, enforcePolicySections } from '../policy/policy.js';

if (!ENV.OPENAI_API_KEY) {
  console.warn('[ai] OPENAI_API_KEY missing — responses will be generic fallback.');
}

/** small sanitizer so UI doesn’t get PDF noise */
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

/** fallback body built from context + refs, then normalized by policy */
function synthesizeFromContext({ contextText, references }) {
  const ctx = clean(contextText || '');
  const snippet = ctx ? (ctx.length > 1800 ? `${ctx.slice(0, 1800)}…` : ctx) : '';

  const lines = snippet.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const bullets = [];
  for (const l of lines) {
    if (/^\d+\./.test(l)) { bullets.push(l.replace(/^\d+\.\s*/, '')); continue; }
    if (/^[-•]\s*/.test(l)) { bullets.push(l.replace(/^[-•]\s*/, '')); continue; }
    if (bullets.length >= 10) break;
  }

  const refs = (Array.isArray(references) ? references : [])
    .slice(0, 8)
    .map(r => {
      const t = r?.title || r?.model_key || [r?.manufacturer, r?.description].filter(Boolean).join(' ');
      return `• ${r.source || 'source'}${t ? ` — ${t}` : ''}`;
    });

  const rough = [
    '**In a nutshell**',
    'Here’s a concise answer based on your documents and retrieved matches.',
    bullets.length ? '\n**Step-by-step**\n' + bullets.map((b,i)=>`${i+1}. ${b}`).join('\n') : '',
    '\n**What’s next**',
    'Need further details or clarification?',
    refs.length ? '\n**References**\n' + refs.join('\n') : ''
  ].join('\n').trim();

  const text = enforcePolicySections(rough);
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

/** keep only refs that appear in the body text (match by human-readable fields) */
function filterUsedReferences(text = '', refs = []) {
  const used = [];
  const body = String(text || '').toLowerCase();

  function keys(r) {
    const k = [];
    if (r?.title) k.push(r.title);
    if (r?.model_key) k.push(r.model_key);
    if (r?.manufacturer || r?.description) {
      k.push([r.manufacturer, r.description].filter(Boolean).join(' '));
    }
    return k.filter(Boolean).map(x => String(x).toLowerCase());
  }

  for (const r of Array.isArray(refs) ? refs : []) {
    const k = keys(r);
    if (!k.length) continue;
    if (k.some(token => token && body.includes(token))) {
      if (!used.some(u => u === r)) used.push(r);
    }
  }

  // if nothing matched, just return the first few
  return used.length ? used : (Array.isArray(refs) ? refs.slice(0, 6) : []);
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
  const system = getSystemPreamble();

  // prefer ai.generateStructured / generate / complete (in that order)
  const gen =
    ai.generateStructured ||
    ai.generate ||
    ai.complete ||
    (ai.default && (ai.default.generateStructured || ai.default.generate || ai.default.complete));

  // optional: your string-based helper if present
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
    if (typeof gen === 'function') {
      const out = await gen({ system, user, references, tone });
      const rawText = clean(out?.raw?.text || '');
      if (rawText) {
        // normalize to policy headings/order, but FALL BACK to raw if shaping is empty
        const shaped = enforcePolicySections(rawText);
        const finalText = shaped && shaped.trim() ? shaped : rawText;
        if (!shaped || !shaped.trim()) {
          console.warn('[policy] shaped text was empty — using raw text');
        }

        const combinedRefs = [
          ...(Array.isArray(out?.raw?.references) ? out.raw.references : []),
          ...(Array.isArray(references) ? references : [])
        ];
        const finalRefs = filterUsedReferences(finalText, combinedRefs).slice(0, 12);

        return {
          title: out.title || 'Answer',
          summary: out.summary || '',
          bullets: Array.isArray(out.bullets) ? out.bullets : [],
          cta: out.cta ?? null,
          assets, playbooks, webSnippets,
          raw: { text: finalText, references: finalRefs }
        };
      }
    } else if (typeof completion === 'function') {
      const prompt = [
        'You are helping a boat owner.',
        system,
        '---',
        `Question:\n${question}`,
        `Relevant context:\n${contextText || '(none)'}`,
        'Respond clearly and concisely using the policy sections.'
      ].join('\n\n');

      const aiTextRaw = await completion({ prompt, systemExtra: '', temperature: 0.2 });
      const cleaned = clean(String(aiTextRaw || ''));
      const shaped = enforcePolicySections(cleaned);
      const finalBody = shaped && shaped.trim() ? shaped : cleaned;
      if (!shaped || !shaped.trim()) {
        console.warn('[policy] shaped text was empty — using raw text');
      }

      const finalRefs = filterUsedReferences(finalBody, references).slice(0, 12);

      return {
        title: 'Answer',
        summary: '',
        bullets: [],
        cta: null,
        assets, playbooks, webSnippets,
        raw: { text: finalBody, references: finalRefs }
      };
    } else {
      console.warn('[responder] No AI generator function found on aiService. Falling back.');
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[responder] AI generation error:', e.message);
    }
  }

  // Fallback keeps policy shape too
  const synth = synthesizeFromContext({ contextText, references });
  synth.raw.references = filterUsedReferences(synth.raw.text, synth.raw.references).slice(0, 12);
  return { ...synth, assets, playbooks, webSnippets };
}

export default { composeResponse };
