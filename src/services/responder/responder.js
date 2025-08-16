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
