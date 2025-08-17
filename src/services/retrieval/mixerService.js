// src/services/retrieval/mixerService.js
import supabase from '../../config/supabase.js';
import { pineconeAdapter as pinecone } from '../vector/pineconeAdapter.js';
import * as ai from '../ai/aiService.js';
import {
  searchPlaybooks,
  formatPlaybookBlock,
  derivePlaybookKeywords
} from '../sql/playbookService.js';

/* ---------- Sanitizer (kills PDF/OCR noise) ---------- */
function cleanChunk(t = '') {
  return String(t)
    .replace(/\b(\d{1,3})\s*\|\s*Pa\s*ge\b/gi, '') // "37 | Pa ge"
    .replace(/\bPage\s+\d+\b/gi, '')
    .replace(/·/g, '•')
    .replace(/-\s*\n\s*/g, '')                     // de-hyphenate
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n(?!\n)/g, ' ')                      // single newlines → spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ---------- Utility ---------- */
function dedupById(items) {
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

function onTopic(hints, text) {
  const s = String(text || '').toLowerCase();
  return hints.some(h => s.includes(h));
}

/* ---------- Boat-specific SQL (optional) ---------- */
async function fetchBoatKnowledge(boatId, limit = 2) {
  if (!supabase || !boatId) return [];
  const { data, error } = await supabase
    .from('system_knowledge')
    .select('id,title,content,source,knowledge_type,updated_at')
    .eq('boat_id', boatId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data.map(r => ({
    id: r.id,
    score: 0.85,
    source: 'system_knowledge',
    text: cleanChunk([r.title ? `**${r.title}**` : '', r.content || ''].filter(Boolean).join('\n\n'))
  }));
}

/* ---------- Vector (Pinecone) ---------- */
async function vectorRetrieve(question, { topK = 8, namespace, hints }) {
  const out = { defaultMatches: [], worldMatches: [] };

  const embedFn =
    ai.embed ||
    (ai.aiService && ai.aiService.embed) ||
    (typeof ai.default === 'object' && ai.default.embed) ||
    null;

  if (!embedFn || !pinecone) return out;

  let vector = null;
  try {
    vector = await embedFn(question);
  } catch {
    return out;
  }
  if (!Array.isArray(vector) || !vector.length) return out;

  const k = Math.max(3, Math.min(Number(process.env.RETRIEVAL_TOPK) || topK, 20));

  // local/default
  try {
    const def = await pinecone.query({
      vector,
      topK: k,
      namespace: namespace || undefined
    });
    out.defaultMatches = (def || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch {
    out.defaultMatches = [];
  }

  // world (guardrailed)
  try {
    const worldNs = process.env.WORLD_NAMESPACE || 'world';
    const w = await pinecone.query({
      vector,
      topK: Math.min(k, 5),
      namespace: worldNs
    });
    // Score/allowlist/thresholds are already applied in your adapter; keep a light topical filter here too:
    out.worldMatches = (w || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch {
    out.worldMatches = [];
  }

  // topical filter for default namespace
  const topical = out.defaultMatches.filter(m => onTopic(hints, m.text));
  topical.sort((a, b) => (b.score || 0) - (a.score || 0));

  out.defaultMatches = topical.slice(0, 5);
  out.worldMatches = out.worldMatches.slice(0, 1);

  return out;
}

/* ---------- Main: SQL-first (playbooks → boat) then vector ---------- */
export async function buildContextMix({ question, boatId = null, namespace, topK = 8, requestId }) {
  const meta = {
    requestId,
    playbook_hit: false,
    sql_rows: 0,
    sql_selected: 0,
    vec_default_matches: 0,
    vec_world_matches: 0,
    failures: []
  };

  const hints = derivePlaybookKeywords(question);
  const parts = [];
  const refs = [];

  // 1) Playbooks (hard priority)
  try {
    const pbs = await searchPlaybooks(question, { limit: 3 });
    meta.sql_rows += pbs.length;

    // Keep the best one (or two) so they dominate context
    for (const pb of pbs.slice(0, 2)) {
      const block = formatPlaybookBlock(pb);
      if (block) {
        parts.push(block);
        refs.push({ id: pb.id, source: 'standards_playbooks', score: Math.min(0.95, (pb.score || 1) / 10 + 0.85) });
        meta.sql_selected += 1;
      }
    }
    if (meta.sql_selected > 0) meta.playbook_hit = true;
  } catch (e) {
    meta.failures.push(`playbooks:${e.message}`);
  }

  // 2) Boat knowledge (sprinkle)
  try {
    const boat = await fetchBoatKnowledge(boatId, 2);
    for (const b of boat) {
      parts.push(b.text);
      refs.push({ id: b.id, source: 'system_knowledge', score: b.score });
      meta.sql_selected += 1;
    }
  } catch (e) {
    meta.failures.push(`boat_sql:${e.message}`);
  }

  // 3) Vectors (topical, capped)
  try {
    const { defaultMatches, worldMatches } = await vectorRetrieve(question, { topK, namespace, hints });
    meta.vec_default_matches = defaultMatches.length;
    meta.vec_world_matches = worldMatches.length;

    for (const m of defaultMatches.slice(0, 3)) {
      parts.push(m.text);
      refs.push({ id: m.id, source: m.source || 'default', score: m.score });
    }
    for (const m of worldMatches.slice(0, 1)) {
      parts.push(m.text);
      refs.push({ id: m.id, source: m.source || 'world', score: m.score });
    }
  } catch (e) {
    meta.failures.push(`vector:${e.message}`);
  }

  // Dedup references, assemble & sanitize final
  const references = dedupById(refs);
  const contextText = cleanChunk(parts.join('\n\n'));

  return { contextText, references, meta };
}

export default { buildContextMix };
