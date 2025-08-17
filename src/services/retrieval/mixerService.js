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

/* ---------- Intent hints & stoplists ---------- */
function detectIntent(question) {
  const q = String(question || '').toLowerCase();
  const helmish = /\b(helm|station|transfer|take\s*control|upper|lower|vc[-\s]?20|zf)\b/;
  if (helmish.test(q)) return 'helm-transfer';
  return 'generic';
}

function stoplistForIntent(intent) {
  // Terms that commonly bleed in from general manuals and are irrelevant for helm transfer.
  const common = [
    /\bbattery|batteries\b/i,
    /\bbow\s*thruster\b/i,
    /\bweekly\s*checks?\b/i,
    /\blife\s*jackets?\b/i,
    /\bwinch(es)?\b/i,
    /\bpolish\b/i,
    /\bclean(?:ing)?\b/i,
    /\bwash\s*down\b/i,
    /\bventilation systems?\b/i,
    /\b(stainless|lifelines|stanchions)\b/i,
    /\banchor\b/i,
    /\bdeck\s+gear\b/i,
    /\bwatermaker\b/i,
    /\baircon\b/i,
    /\bgenerator\b/i,
    /\bshower\b/i,
  ];

  if (intent === 'helm-transfer') {
    return [
      ...common,
      /\b(toilets?|heads?)\b/i,
      /\bbilge(s)?\b/i,
      /\bweekly\s+maintenance\b/i,
      /\bpropeller\b/i,
      /\bfeather\b/i,
      /\bsail\s*drive\b/i,
      /\bcharge(?:r|s|ing)?\b/i,
    ];
  }
  return common;
}

function positiveHintsForIntent(intent) {
  if (intent === 'helm-transfer') {
    return [
      'helm', 'station', 'transfer', 'select', 'control',
      'upper', 'lower', 'vc20', 'vc-20', 'zf', 'active station',
      'neutral', 'inhibit', 'take control', 'led', 'n2k', 'nmea', 'can'
    ];
  }
  return [];
}

/* ---------- Scoring / re-ranking ---------- */
function scoreChunkByHints(text, hints = [], penalties = []) {
  const s = String(text || '').toLowerCase();
  let score = 0;

  // reward: hint overlap
  for (const h of hints) {
    if (!h) continue;
    const re = new RegExp(`\\b${escapeRegex(h)}\\b`, 'i');
    if (re.test(s)) score += 2; // hints are meaningful
  }

  // penalty: stoplist matches
  for (const p of penalties) {
    if (p.test(s)) score -= 3;
  }

  // small reward for strongly topical words even if not in hints
  if (/\b(helm|station|transfer|vc[-\s]?20|zf)\b/i.test(s)) score += 2;

  return score;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function reRankAndPrune(matches, { keep = 4, intent }) {
  if (!Array.isArray(matches) || !matches.length) return [];

  const penalties = stoplistForIntent(intent);
  const hints = positiveHintsForIntent(intent);

  // score, drop negatives, sort, and take top-K
  const scored = matches
    .map(m => ({
      ...m,
      _scoreLocal: scoreChunkByHints(m.text || '', hints, penalties)
    }))
    .filter(m => m._scoreLocal > 0) // cut obvious off-topic chunks
    .sort((a, b) => {
      // prefer higher pinecone score, then local topical score
      const pv = (b.score || 0) - (a.score || 0);
      if (pv !== 0) return pv;
      return (b._scoreLocal || 0) - (a._scoreLocal || 0);
    });

  // avoid duplicates by id/text prefix
  const seen = new Set();
  const out = [];
  for (const m of scored) {
    const key = m.id || (m.text || '').slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= keep) break;
  }
  return out;
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

function capContext(text, maxChars = 6000) {
  const t = String(text || '');
  if (t.length <= maxChars) return t;
  // try to cut at a paragraph boundary
  const cut = t.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return cut.slice(0, lastBreak > 1200 ? lastBreak : maxChars);
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

  // resolve embed function for safety regardless of how aiService is imported
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
    out.worldMatches = (w || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch {
    out.worldMatches = [];
  }

  // light topical filter before deeper pruning
  const topical = out.defaultMatches.filter(m => onTopic(hints, m.text));
  topical.sort((a, b) => (b.score || 0) - (a.score || 0));

  out.defaultMatches = topical.slice(0, 8); // keep some for re-ranker
  out.worldMatches = out.worldMatches.slice(0, 2);

  return out;
}

/* ---------- Main: SQL-first (playbooks → boat) then vector + re-rank ---------- */
export async function buildContextMix({ question, boatId = null, namespace, topK = 8, requestId }) {
  const meta = {
    requestId,
    playbook_hit: false,
    sql_rows: 0,
    sql_selected: 0,
    vec_default_matches: 0,
    vec_world_matches: 0,
    pruned_default: 0,
    pruned_world: 0,
    failures: []
  };

  const intent = detectIntent(question);
  const hints = derivePlaybookKeywords(question);
  const parts = [];
  const refs = [];

  // 1) Playbooks (hard priority) — standards_playbooks → context
  try {
    const pbs = await searchPlaybooks(question, { limit: 3 });
    meta.sql_rows += pbs.length;

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

  // 2) Boat knowledge (sprinkle) — system_knowledge → context
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

  // 3) Vectors (retrieve) — Pinecone default + world
  let defaultMatches = [];
  let worldMatches = [];
  try {
    const res = await vectorRetrieve(question, { topK, namespace, hints });
    defaultMatches = res.defaultMatches || [];
    worldMatches = res.worldMatches || [];
    meta.vec_default_matches = defaultMatches.length;
    meta.vec_world_matches = worldMatches.length;
  } catch (e) {
    meta.failures.push(`vector:${e.message}`);
  }

  // 4) Re-rank & prune to kill bleed-through
  const prunedDefault = reRankAndPrune(defaultMatches, { keep: 3, intent });
  const prunedWorld = reRankAndPrune(worldMatches, { keep: 1, intent });
  meta.pruned_default = prunedDefault.length;
  meta.pruned_world = prunedWorld.length;

  for (const m of prunedDefault) {
    parts.push(m.text);
    refs.push({ id: m.id, source: m.source || 'default', score: m.score });
  }
  for (const m of prunedWorld) {
    parts.push(m.text);
    refs.push({ id: m.id, source: m.source || 'world', score: m.score });
  }

  // Dedup references, assemble & sanitize final
  const references = dedupById(refs);

  // Cap overall context size to avoid long tail junk
  const contextText = capContext(cleanChunk(parts.join('\n\n')), 6000);

  return { contextText, references, meta };
}

export default { buildContextMix };
