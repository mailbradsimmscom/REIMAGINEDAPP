// src/services/responder/responder.js
// Shapes the final structured answer while honoring tone presets.
// Keeps the same outward contract your routes rely on.

import { selectTone } from './tonePresets.js';

function joinRefs(refs = []) {
  return refs
    .filter(r => r && (r.source || r.id))
    .map(r => ({ id: r.id || null, source: r.source || null, score: r.score }))
    .slice(0, 8);
}

// Primitive hazard detector to nudge a Safety block if context mentions risky ops.
function detectSafety(context = '') {
  const s = (context || '').toLowerCase();
  const hits = [];
  if (s.includes('pressure') || s.includes('depressur')) hits.push('Depressurize the system before opening any lines.');
  if (s.includes('electrical') || s.includes('12v') || s.includes('240v') || s.includes('120v')) hits.push('Isolate electrical power before servicing.');
  if (s.includes('chemical') || s.includes('acid') || s.includes('alkaline')) hits.push('Use gloves/eye protection for chemicals.');
  if (s.includes('membrane')) hits.push('Avoid contamination of RO membranes; keep them sealed/wet as specified.');
  return hits;
}

export function composeResponse({ question, contextText, references = [], tone }) {
  const toneCfg = selectTone(tone);

  // Minimal extraction for common maintenance answers
  const lines = (contextText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = [];
  const tools = [];
  const steps = [];

  for (const line of lines) {
    const L = line.toLowerCase();

    // naive tools/materials detection
    if (L.startsWith('- ') || L.startsWith('• ')) {
      // if list looks like tools, bucket tentatively
      if (L.includes('filter') || L.includes('wrench') || L.includes('cloth') || L.includes('lubric')) {
        tools.push(line.replace(/^[-•]\s*/, ''));
        continue;
      }
    }

    // steps extraction
    if (/^\d+\./.test(line)) {
      steps.push(line);
      continue;
    }

    // general bullets (maintenance intervals, etc.)
    if (L.includes('every ') || L.includes('replace') || L.includes('clean') || L.includes('purge')) {
      bullets.push(line);
      continue;
    }
  }

  // Safety hints
  const safety = detectSafety(contextText);

  // Summary (first good lines or fallback)
  const summary =
    bullets[0] ||
    steps[0]?.replace(/^\d+\.\s*/, '') ||
    lines.slice(0, 1)[0] ||
    'No specific procedures found in the provided context.';

  // Build “raw” text in your recognizable house style
  const h = toneCfg.headings;
  const pfx = toneCfg.style.bulletsPrefix;

  let rawParts = [];

  rawParts.push(`**${h.nutshell}**`);
  rawParts.push(summary);

  if (toneCfg.style.includeTools && tools.length) {
    rawParts.push(`\n**${h.tools || 'Tools & Materials'}**`);
    for (const t of tools.slice(0, 8)) rawParts.push(`${pfx}${t}`);
  }

  if (toneCfg.style.includeSteps && steps.length) {
    rawParts.push(`\n**${h.steps || 'Step-by-step'}**`);
    for (const s of steps.slice(0, 12)) rawParts.push(s.replace(/^\d+\.\s*/, (m) => m)); // keep numbering if present
  } else if (bullets.length) {
    rawParts.push(`\n**${h.steps || 'Steps'}**`);
    for (const b of bullets.slice(0, 8)) rawParts.push(`${pfx}${b}`);
  }

  if (toneCfg.style.includeSafety && safety.length) {
    rawParts.push(`\n**${h.safety || 'Safety'}**`);
    for (const s of safety) rawParts.push(`${pfx}${s}`);
  }

  // Optionally add a “What’s next” CTA
  rawParts.push(`\n**${h.next || 'What’s next'}**`);
  rawParts.push('Want me to tailor this to your exact model and usage?');

  // References footer (IDs/short sources only)
  const refs = joinRefs(references);
  if (refs.length) {
    rawParts.push(`\n**${h.refs || 'References'}**`);
    for (const r of refs) rawParts.push(`${pfx}${r.source || r.id}`);
  }

  const rawText = rawParts.join('\n');

  // Top-level structured response (stable to your serializers)
  return {
    title: 'Answer',
    summary,
    bullets: bullets.slice(0, 5).map(b => b.replace(/^\d+\.\s*/, '')),
    cta: null,
    raw: {
      text: rawText,
      references: refs
    }
  };
}

export default { composeResponse };
