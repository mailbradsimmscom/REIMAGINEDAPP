// src/services/retrieval/mixerService.js
import supabase from '../../config/supabase.js';
import { pineconeAdapter as pinecone } from '../vector/pineconeAdapter.js';
import * as ai from '../ai/aiService.js';
import {
  searchPlaybooks,
  formatPlaybookBlock,
  deriveHelmKeywords
} from '../sql/playbookService.js';
import retrievalConfig from './retrievalConfig.json' with { type: 'json' };
import intentConfig from './intentConfig.json' with { type: 'json' };

/* ---------- Question intent classifier ---------- */
export async function classifyQuestion(question = '') {
  const q = String(question).toLowerCase();

  const rules = intentConfig?.intents || intentConfig || {};
  for (const [intent, rule] of Object.entries(rules)) {
    const { all = [], any = [] } = rule || {};
    const allMatch = all.every(p => new RegExp(p, 'i').test(q));
    const anyMatch = any.length === 0 || any.some(p => new RegExp(p, 'i').test(q));
    if (allMatch && anyMatch) return intent;
  }

  if (typeof ai.classifyIntent === 'function') {
    try {
      const aiIntent = await ai.classifyIntent(question);
      if (aiIntent) return aiIntent;
    } catch {
      /* ignore AI failures */
    }
  }

  return 'generic';
}

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

/* ---------- Scoring / re-ranking ---------- */
function scoreChunkByHints(text, hints = []) {
  const s = String(text || '').toLowerCase();
  let score = 0;

  for (const h of hints) {
    if (!h) continue;
    const re = new RegExp(`\\b${escapeRegex(h)}\\b`, 'i');
    if (re.test(s)) score += 2;
  }

  return score;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function reRankAndPrune(matches, { keep = 4, hints = [] }) {
  if (!Array.isArray(matches) || !matches.length) return [];

  const scored = matches
    .map((m) => ({
      ...m,
      _scoreLocal: scoreChunkByHints(m.text || '', hints)
    }))
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
  let topical = out.defaultMatches;
  if (Array.isArray(hints) && hints.length) {
    topical = out.defaultMatches.filter((m) => onTopic(hints, m.text));
  }
  topical.sort((a, b) => (b.score || 0) - (a.score || 0));

  out.defaultMatches = topical.slice(0, 8); // keep some for re-ranker
  out.worldMatches = out.worldMatches.slice(0, 2);

  return out;
}

/* ---------- Main: SQL-first (playbooks → boat) then vector + re-rank ---------- */
export async function buildContextMix({
  question,
  boatId = null,
  namespace,
  topK = 8,
  requestId,
  intent = 'generic'
}) {
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

  const hints = intent === 'helm-transfer' ? deriveHelmKeywords(question) : [];
  const parts = [];
  const refs = [];

  const steps = {
    async playbookSearch() {
      if (!hints.length) return;
      try {
        const pbs = await searchPlaybooks(question, { limit: 3 });
        meta.sql_rows += pbs.length;
        for (const pb of pbs.slice(0, 2)) {
          const block = formatPlaybookBlock(pb);
          if (block) {
            parts.push(block);
            refs.push({
              id: pb.id,
              source: 'standards_playbooks',
              score: Math.min(0.95, (pb.score || 1) / 10 + 0.85)
            });
            meta.sql_selected += 1;
          }
        }
        if (meta.sql_selected > 0) meta.playbook_hit = true;
      } catch (e) {
        meta.failures.push(`playbooks:${e.message}`);
      }
    },

    async boatKnowledge() {
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
    },

    async vectorSearch() {
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

      const prunedDefault = reRankAndPrune(defaultMatches, { keep: 3, hints });
      const prunedWorld = reRankAndPrune(worldMatches, { keep: 1, hints });
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
    }
  };

  const plan =
    retrievalConfig[intent] || retrievalConfig.default || Object.keys(steps);

  for (const step of plan) {
    const fn = steps[step];
    if (typeof fn === 'function') {
      await fn();
    }
  }

  const references = dedupById(refs);
  const contextText = capContext(cleanChunk(parts.join('\n\n')), 6000);
  return { contextText, references, meta };
}

export default { buildContextMix, classifyQuestion };
