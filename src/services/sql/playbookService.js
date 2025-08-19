// src/services/sql/playbookService.js
import supabase from '../../config/supabase.js';

/* --------------------- helpers --------------------- */

const STOPWORDS = new Set([
  'the','and','for','you','your','yours','me','my','our','we','us',
  'a','an','of','in','on','to','from','by','with','as','at','is','are','was','were',
  'it','its','this','that','these','those','there','here',
  'about','tell','please','now','today','hey','hi','hello'
]);

function uniq(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
function norm(s = '') {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Derive meaningful keywords strictly from the user's text.
 * - lowercase
 * - drop stopwords
 * - keep only 3..32 chars
 */
export function derivePlaybookKeywords(question = '') {
  const tokens = String(question)
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
    .filter(w => w.length >= 3 && w.length <= 32 && !STOPWORDS.has(w));
  return uniq(tokens).slice(0, 6);
}

/**
 * Normalize one playbook row into a block object.
 */
export function formatPlaybookBlock(row) {
  if (!row) return null;

  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
      catch { return []; }
    }
    return [];
  };

  let steps = [];
  if (Array.isArray(row.steps)) {
    steps = row.steps.filter(Boolean).map(norm);
  } else if (typeof row.steps === 'string' && row.steps.trim()) {
    try {
      const parsed = JSON.parse(row.steps);
      if (Array.isArray(parsed)) steps = parsed.filter(Boolean).map(norm);
    } catch {
      steps = row.steps.split(/\r?\n/).map(norm).filter(Boolean);
    }
  }

  const block = {
    id: row.id,
    title: norm(row.title || ''),
    summary: norm(row.summary || ''),
    steps,
    safety: norm(row.safety || ''),
    matchers: toArray(row.matchers),
    triggers: toArray(row.triggers),
    updatedAt: row.updated_at || null,
    source: 'standards_playbooks',
    score: row.score || null
  };

  if (!block.title && !block.summary && steps.length === 0 && !block.safety) return null;
  return block;
}

/**
 * Search Supabase "standards_playbooks" using real keywords.
 * We:
 *  - bail if no meaningful keywords
 *  - OR-search title+summary for the first few kws
 *  - search matchers/triggers arrays for each kw
 *  - dedup + score by keyword coverage; return top N
 */
export async function searchPlaybooks(question, { limit = 5 } = {}) {
  if (!supabase) return [];
  const kws = derivePlaybookKeywords(question);
  if (!kws.length) return []; // IMPORTANT: prevents broad matches

  const selectCols = 'id,title,summary,steps,safety,matchers,triggers,updated_at';
  let rows = [];

  // ---- Text search in title/summary (ILIKE OR)
  try {
    const ors = [];
    for (const kw of kws.slice(0, 4)) {
      const pat = `%${kw}%`;
      ors.push(`title.ilike.${pat}`);
      ors.push(`summary.ilike.${pat}`);
    }
    if (ors.length) {
      const { data, error } = await supabase
        .from('standards_playbooks_compat')
        .select(selectCols)
        .or(ors.join(','))
        .limit(30);
      if (!error && Array.isArray(data)) rows = rows.concat(data);
    }
  } catch {}

  // ---- Array contains on matchers / triggers for each kw
  for (const kw of kws.slice(0, 4)) {
    try {
      const { data, error } = await supabase
        .from('standards_playbooks_compat')
        .select(selectCols)
        .contains('matchers', [kw])
        .limit(20);
      if (!error && Array.isArray(data)) rows = rows.concat(data);
    } catch {}
    try {
      const { data, error } = await supabase
        .from('standards_playbooks_compat')
        .select(selectCols)
        .contains('triggers', [kw])
        .limit(20);
      if (!error && Array.isArray(data)) rows = rows.concat(data);
    } catch {}
  }

  // ---- Dedup by id
  const seen = new Set();
  rows = rows.filter(r => r && r.id && !seen.has(r.id) && seen.add(r.id));

  if (!rows.length) return [];

  // ---- Score rows by keyword coverage
  const lowerIncludes = (text, kw) => String(text || '').toLowerCase().includes(kw);
  const scoreRow = (r) => {
    let score = 0;
    const title = String(r.title || '').toLowerCase();
    const summary = String(r.summary || '').toLowerCase();
    const matchers = Array.isArray(r.matchers) ? r.matchers : [];
    const triggers = Array.isArray(r.triggers) ? r.triggers : [];

    for (const kw of kws) {
      if (title.includes(kw)) score += 3;
      if (summary.includes(kw)) score += 1;
      if (matchers.some(m => lowerIncludes(m, kw))) score += 4;
      if (triggers.some(t => lowerIncludes(t, kw))) score += 3;
    }
    if (r.updated_at) score += 0.25; // mild recency nudge
    return score;
  };

  const scored = rows
    .map(r => ({ ...r, score: scoreRow(r) }))
    .filter(r => r.score > 0)              // must match at least one kw
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return scored;
}

export default { searchPlaybooks, formatPlaybookBlock, derivePlaybookKeywords };
