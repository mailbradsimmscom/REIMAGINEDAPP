// src/services/sql/knowledgeService.js
import { supabase } from '../../config/supabase.js';

// --- small utils
const norm = (s) => String(s || '').toLowerCase();
const has = (hay, needle) => norm(hay).includes(norm(needle));

/**
 * Get boat systems (single boat setup, so no boat_id filter)
 */
export async function getBoatSystems() {
  if (!supabase) return { rows: [], error: 'no_supabase' };
  const { data, error } = await supabase
    .from('boat_systems_compat')
    .select('id, category, brand, model, serial_number, installation_date, specifications, updated_at')
    .order('updated_at', { ascending: false });

  return { rows: data || [], error: error?.message || null };
}

/**
 * Heuristic to pick a focus system based on the question and available systems
 */
export function findFocusSystem(question, systems = []) {
  const q = norm(question);
  if (!q || !systems.length) return null;

  const scored = systems.map((s) => {
    let score = 0;
    if (s.category && has(q, s.category)) score += 3;
    if (s.brand && has(q, s.brand)) score += 2;
    if (s.model && has(q, s.model)) score += 2;
    if (/maintain|service|filter|schedule|troubleshoot|replace|clean/i.test(q)) score += 1;
    return { score, s };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score === 0) return null;

  const f = top.s;
  return {
    id: f.id,
    category: f.category || null,
    brand: f.brand || null,
    model: f.model || null,
    serial_number: f.serial_number || null,
    installation_date: f.installation_date || null,
  };
}

/**
 * Fetch playbooks likely relevant to a system or the question.
 * Returns up to `linesMax` short snippets with origin='playbook'
 */
export async function getPlaybookSnippets({ question, focusSystem, linesMax = 4 }) {
  if (!supabase) return { lines: [], refs: [], meta: { sql_offline: true } };

  const { data, error } = await supabase
    .from('standards_playbooks')
    .select('id, archetype_key, title, summary, triggers, steps, matchers, ref_urls, updated_at')
    .order('updated_at', { ascending: false });

  if (error) return { lines: [], refs: [], meta: { error: error.message } };

  const q = norm(question);
  const sysWords = [
    focusSystem?.category,
    focusSystem?.brand,
    focusSystem?.model
  ].filter(Boolean).map(norm);

  const scored = (data || []).map(pb => {
    let score = 0;
    if (pb.archetype_key && sysWords.some(w => has(pb.archetype_key, w))) score += 3;
    if (pb.title && sysWords.some(w => has(pb.title, w))) score += 2;

    const triggers = Array.isArray(pb.triggers) ? pb.triggers : [];
    if (triggers.some(t => has(q, t))) score += 2;

    const matchers = pb.matchers && typeof pb.matchers === 'object' ? pb.matchers : {};
    const textMatchers = Object.values(matchers).flat().map(String);
    if (textMatchers.some(m => has(q, m))) score += 2;

    if (pb.summary && has(pb.summary, focusSystem?.category || '')) score += 1;

    return { score, pb };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);

  const lines = [];
  const refs = [];

  for (const { pb } of scored) {
    if (lines.length >= linesMax) break;

    if (pb.summary) {
      const s = pb.summary.trim();
      if (s) {
        lines.push(s);
        refs.push({ origin: 'playbook', id: pb.id, source: 'standards_playbooks', text: s, score: 1.0 });
      }
    }

    const steps = Array.isArray(pb.steps) ? pb.steps : [];
    for (const step of steps) {
      if (lines.length >= linesMax) break;
      const text = typeof step === 'string'
        ? step
        : (step?.text || step?.description || step?.summary || '');
      if (text && text.trim()) {
        const t = text.trim();
        lines.push(t);
        refs.push({ origin: 'playbook', id: pb.id, source: 'standards_playbooks', text: t, score: 0.9 });
      }
    }
  }

  return { lines, refs, meta: { playbook_hit: lines.length > 0, playbooks_considered: scored.length } };
}

/**
 * Fetch system_knowledge snippets (single boat setup, no boat_id filter)
 * Returns up to `linesMax` lines with origin='boat_sql'
 */
export async function getSystemKnowledgeSnippets({ focusSystem, question, linesMax = 6 }) {
  if (!supabase) return { lines: [], refs: [], meta: { sql_offline: !supabase } };

  let q = supabase
    .from('system_knowledge')
    .select('id, system_id, knowledge_type, title, content, source, updated_at')
    .order('updated_at', { ascending: false });

  if (focusSystem?.id) q = q.eq('system_id', focusSystem.id);

  const { data, error } = await q;
  if (error) return { lines: [], refs: [], meta: { error: error.message } };

  const rows = data || [];
  const qn = norm(question);

  const rowsScored = rows.map(r => {
    let score = 0;
    if (r.knowledge_type && /maintain|maintenance|service|filter|replace|schedule/.test(norm(r.knowledge_type))) score += 2;
    if (r.title && has(qn, r.title)) score += 1;
    if (r.content && has(r.content, focusSystem?.category || '')) score += 1;
    return { score, r };
  }).sort((a,b) => b.score - a.score);

  const lines = [];
  const refs = [];

  for (const { r } of rowsScored) {
    if (lines.length >= linesMax) break;
    const header = r.title ? r.title.trim() : null;

    const snippet = String(r.content || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' ');

    const payload = (header ? `${header}: ` : '') + snippet;

    if (payload.trim()) {
      const t = payload.trim();
      lines.push(t);
      refs.push({
        origin: 'boat_sql',
        id: r.id,
        source: r.source || 'system_knowledge',
        text: t,
        score: 0.85
      });
    }
  }

  return { lines, refs, meta: { sql_rows: rows.length, sql_selected: lines.length } };
}

/**
 * Optional: build a single-line header for the focus system
 */
export function makeSystemHeader(focusSystem) {
  if (!focusSystem) return null;
  const parts = [];
  if (focusSystem.category) parts.push(focusSystem.category);
  const detail = [focusSystem.brand, focusSystem.model].filter(Boolean).join(' ');
  if (detail) parts.push(detail);
  const label = parts.join(' — ');
  return label ? `System: ${label}` : null;
}
