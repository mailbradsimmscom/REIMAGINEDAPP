// src/services/sql/playbookService.js
import supabase from '../../config/supabase.js';

/**
 * Normalize/clean strings a bit before matching/formatting.
 */
function clean(s = '') {
  return String(s)
    .replace(/\u00A0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Derive robust keyword set for helm transfer / VC20 / ZF-like queries.
 * (No brand hard-coding beyond widely used tokens.)
 */
export function derivePlaybookKeywords(question) {
  const q = String(question || '').toLowerCase();

  const base = [
    'helm', 'station', 'transfer', 'select',
    'control', 'take', 'active', 'upper', 'lower'
  ];

  // common brand/system tokens users actually type
  const brandish = [];
  if (/\bvc[-\s]?20\b/.test(q)) brandish.push('vc20', 'vc-20', 'vc 20');
  if (/\bzf\b/.test(q)) brandish.push('zf');
  if (/\bnmea\s*2000\b|\bn2k\b|\bcan\b/.test(q)) brandish.push('n2k', 'nmea 2000', 'can');

  // phrasal hints
  const phrases = [];
  if (/won'?t|cannot|can'?t|will not/i.test(q)) phrases.push('won’t transfer', 'will not transfer', 'won’t take control');

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean).map(s => s.toLowerCase())));
  return uniq([...base, ...brandish, ...phrases]);
}

/**
 * Compute a simple match score: trigger overlap + title/summary hits.
 */
function scorePlaybook(pb, keywords) {
  const tset = new Set((pb?.triggers || []).map((x) => String(x || '').toLowerCase()));
  const kset = new Set(keywords);

  let overlap = 0;
  for (const k of kset) if (tset.has(k)) overlap += 2; // triggers are strong

  const title = String(pb?.title || '').toLowerCase();
  const summary = String(pb?.summary || '').toLowerCase();
  let textHits = 0;
  for (const k of kset) {
    if (title.includes(k)) textHits += 1.5;
    if (summary.includes(k)) textHits += 1.0;
  }

  // updated_at recency nudge (optional + tiny)
  let recency = 0;
  if (pb?.updated_at) {
    try {
      const ageDays = (Date.now() - new Date(pb.updated_at).getTime()) / 86400000;
      recency = Math.max(0, 0.5 - Math.min(ageDays, 365) * 0.001); // ≤ ~0.5
    } catch { /* ignore */ }
  }

  return overlap + textHits + recency;
}

/**
 * Query standards_playbooks:
 *   - Pass A: triggers contains (case variants)
 *   - Pass B: OR ilike on title/summary/safety
 * Returns ranked results with a `score`.
 */
export async function searchPlaybooks(question, { limit = 4 } = {}) {
  if (!supabase) return [];

  const keywords = derivePlaybookKeywords(question);
  if (!keywords.length) return [];

  // Try multiple case variants for text[] contains
  const tries = [
    keywords,
    keywords.map((k) => k.toUpperCase()),
    keywords.map((k) => k[0]?.toUpperCase() + k.slice(1)),
  ];

  let rows = [];
  for (const tlist of tries) {
    const { data, error } = await supabase
      .from('standards_playbooks')
      .select('id,title,summary,safety,steps,triggers,updated_at')
      .contains('triggers', tlist.slice(0, 4)) // keep small to avoid DB scan
      .order('updated_at', { ascending: false })
      .limit(limit * 2);

    if (!error && Array.isArray(data) && data.length) {
      rows = data;
      break;
    }
  }

  // Fallback OR ilike if nothing yet
  if (!rows.length) {
    const ors = [];
    for (const k of keywords.slice(0, 5)) {
      const esc = k.replace(/%/g, '\\%').replace(/_/g, '\\_');
      ors.push(`title.ilike.%${esc}%`, `summary.ilike.%${esc}%`, `safety.ilike.%${esc}%`);
    }
    const { data, error } = await supabase
      .from('standards_playbooks')
      .select('id,title,summary,safety,steps,triggers,updated_at')
      .or(ors.join(','))
      .order('updated_at', { ascending: false })
      .limit(limit * 2);

    if (!error && Array.isArray(data) && data.length) {
      rows = data;
    }
  }

  // Score & rank
  const ranked = rows
    .map((pb) => ({ ...pb, score: scorePlaybook(pb, keywords) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);

  return ranked;
}

/**
 * Render a playbook row to a clean, compact context block (markdown-ish).
 */
export function formatPlaybookBlock(pb) {
  if (!pb) return '';

  const title = pb.title ? `**${clean(pb.title)}**` : '';
  const summary = pb.summary ? clean(pb.summary) : '';
  const safety = pb.safety ? clean(pb.safety) : '';

  let steps = '';
  if (Array.isArray(pb.steps) && pb.steps.length) {
    steps = pb.steps
      .map((s, i) => `${i + 1}. ${clean(typeof s === 'string' ? s : (s?.text || ''))}`)
      .filter(Boolean)
      .join('\n');
  } else if (typeof pb.steps === 'string' && pb.steps.trim()) {
    steps = pb.steps
      .split(/\n+/)
      .map((line, i) => `${i + 1}. ${clean(line)}`)
      .join('\n');
  }

  const parts = [];
  if (title) parts.push(title);
  if (summary) parts.push(summary);
  if (steps) parts.push(steps);
  if (safety) {
    const safebul = safety
      .replace(/^\s*[-*•]\s*/gm, '')
      .split(/\n+/)
      .map((l) => `• ${clean(l)}`)
      .join('\n');
    parts.push(`**⚠️ Safety**\n${safebul}`);
  }

  return parts.filter(Boolean).join('\n\n');
}
