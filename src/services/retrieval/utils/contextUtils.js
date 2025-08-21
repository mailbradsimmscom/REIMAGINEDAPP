// src/services/retrieval/utils/contextUtils.js

/**
 * Remove duplicates from items array by ID
 */
export function dedupById(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it?.id || JSON.stringify(it).slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Cap context text to maximum character length with smart truncation
 */
export function capContext(text, maxChars = 6000) {
  const t = String(text || '');
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return cut.slice(0, lastBreak > 1200 ? lastBreak : maxChars);
}

export default { dedupById, capContext };