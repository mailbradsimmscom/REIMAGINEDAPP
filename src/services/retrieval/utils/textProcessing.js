// src/services/retrieval/utils/textProcessing.js

/* ---------- Sanitizer (kills PDF/OCR noise) ---------- */
export function cleanChunk(t = '') {
  return String(t)
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

/* ---------- Regex utilities ---------- */
export function escapeRegex(str) { 
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

/* ---------- Scoring utilities ---------- */
export function scoreChunkByHints(text, hints = []) {
  const s = String(text || '').toLowerCase();
  let score = 0;
  for (const h of hints) {
    if (!h) continue;
    const re = new RegExp(`\\b${escapeRegex(h)}\\b`, 'i');
    if (re.test(s)) score += 2;
  }
  return score;
}

export default { cleanChunk, escapeRegex, scoreChunkByHints };