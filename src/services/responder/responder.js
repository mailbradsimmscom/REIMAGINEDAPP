const templates = {
  base({ title, summary, bullets = [], cta, raw }) {
    return { title, summary, bullets, cta, raw };
  }
};

async function applyToneAndFormat(draft, opts = {}) {
  const text = typeof draft === 'string' ? draft : (draft.text || '');

  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\s,/, ',')
    .trim();

  const title = (opts.title || 'Answer').trim();
  const summary = cleaned.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
  const rest = cleaned.slice(summary.length).trim();

  const bullets = rest
    .split(/(?<=\.)\s+/)
    .filter(Boolean)
    .slice(0, 6);

  const cta = opts.cta || undefined;

  return templates.base({
    title,
    summary,
    bullets,
    cta,
    raw: draft
  });
}

module.exports = { responder: { applyToneAndFormat } };
