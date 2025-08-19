// src/services/retrieval/mixerService.js
import { pineconeAdapter as pinecone } from '../vector/pineconeAdapter.js';
import * as ai from '../ai/aiService.js';
import {
  searchPlaybooks,
  formatPlaybookBlock,
  derivePlaybookKeywords
} from '../sql/playbookService.js';
import {
  buildWorldQueries,
  serpapiSearch,
  filterAndRank
} from '../world/serpapiService.js';
import { fetchAndChunk } from '../fetch/fetchAndChunk.js';
import retrievalConfig from './retrievalConfig.json' with { type: 'json' };
import intentConfig from './intentConfig.json' with { type: 'json' };

/* ---------- Intent classifier ---------- */
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
    } catch { /* ignore */ }
  }
  return 'generic';
}

/* ---------- Sanitizer (kills PDF/OCR noise) ---------- */
function cleanChunk(t = '') {
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

/* ---------- Re-ranking ---------- */
function escapeRegex(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
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
function reRankAndPrune(matches, { keep = 4, question }) {
  if (!Array.isArray(matches) || !matches.length) return [];
  const hints = derivePlaybookKeywords(question);
  const scored = matches
    .map(m => ({ ...m, _scoreLocal: scoreChunkByHints(m.text || '', hints) }))
    .filter(m => m._scoreLocal > 0)
    .sort((a, b) => ((b.score || 0) - (a.score || 0)) || ((b._scoreLocal || 0) - (a._scoreLocal || 0)));
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

/* ---------- Utils ---------- */
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
function onTopic(hints, text) { const s = String(text || '').toLowerCase(); return hints.some(h => s.includes(h)); }
function capContext(text, maxChars = 6000) {
  const t = String(text || '');
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return cut.slice(0, lastBreak > 1200 ? lastBreak : maxChars);
}

/* ---------- Vector (Pinecone) ---------- */
async function vectorRetrieve(question, { topK = 8, namespace, hints, aiService = ai, pineconeAdapter = pinecone }) {
  const out = { defaultMatches: [], worldMatches: [] };
  const embedFn =
    aiService.embed ||
    (aiService.aiService && aiService.aiService.embed) ||
    (typeof aiService.default === 'object' && aiService.default.embed) ||
    null;
  if (!embedFn || !pineconeAdapter) return out;

  let vector = null;
  try { vector = await embedFn(question); } catch { return out; }
  if (!Array.isArray(vector) || !vector.length) return out;

  const k = Math.max(3, Math.min(Number(process.env.RETRIEVAL_TOPK) || topK, 20));

  try {
    const def = await pineconeAdapter.query({ vector, topK: k, namespace: namespace || undefined });
    out.defaultMatches = (def || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch { out.defaultMatches = []; }

  try {
    const worldNs = process.env.WORLD_NAMESPACE || 'world';
    const w = await pineconeAdapter.query({ vector, topK: Math.min(k, 5), namespace: worldNs });
    out.worldMatches = (w || [])
      .filter(m => m && m.text)
      .map(m => ({ ...m, text: cleanChunk(m.text) }));
  } catch { out.worldMatches = []; }

  const topical = out.defaultMatches.filter(m => onTopic(hints, m.text));
  topical.sort((a, b) => (b.score || 0) - (a.score || 0));
  out.defaultMatches = topical.slice(0, 8);
  out.worldMatches = out.worldMatches.slice(0, 2);
  return out;
}

/* ---------- Main pipeline ---------- */
export async function buildContextMix({
  question, namespace, topK = 8, requestId, intent = 'generic'
}, {
  searchPlaybooks: searchPB = searchPlaybooks,
  formatPlaybookBlock: formatPB = formatPlaybookBlock,
  derivePlaybookKeywords: deriveKW = derivePlaybookKeywords,
  buildWorldQueries: buildWQ = buildWorldQueries,
  serpapiSearch: serpSearch = serpapiSearch,
  filterAndRank: filterRank = filterAndRank,
  fetchAndChunk: fetchChunk = fetchAndChunk,
  aiService: aiSvc = ai,
  pineconeAdapter: pineconeSvc = pinecone
} = {}) {
  const meta = {
    requestId,
    playbook_hit: false,
    sql_rows: 0,
    sql_selected: 0,
    vec_default_matches: 0,
    vec_world_matches: 0,
    pruned_default: 0,
    pruned_world: 0,
    failures: [],
    allow_domains: [],
    router_keywords: []
  };

  const hints = deriveKW(question); // now filters stopwords
  const parts = [];
  const refs = [];

  const steps = {
    async playbookSearch() {
      try {
        // Only run when there are meaningful hints (prevents “match everything”)
        if (!hints || hints.length === 0) return;

        const pbs = await searchPB(question, { limit: 3 });
        meta.sql_rows += pbs.length;

        for (const pb of pbs.slice(0, 2)) {
          const block = formatPB(pb);
          if (!block) continue;

          if (Array.isArray(pb.ref_domains) && pb.ref_domains.length) {
            meta.allow_domains = Array.from(new Set([
              ...meta.allow_domains,
              ...pb.ref_domains
            ]));
          }

          const kwText = [
            pb.title,
            pb.summary,
            ...(Array.isArray(pb.steps) ? pb.steps : []),
            pb.safety
          ].filter(Boolean).join(' ');
          const rk = deriveKW(kwText);
          if (rk.length) {
            meta.router_keywords = Array.from(new Set([
              ...meta.router_keywords,
              ...rk
            ]));
          }

          refs.push({
            id: block.id,
            source: block.source,
            score: Math.min(0.95, (pb.score || 1) / 10 + 0.85)
          });
          meta.sql_selected += 1;
        }
        if (meta.sql_selected > 0) meta.playbook_hit = true;
      } catch (e) { meta.failures.push(`playbooks:${e.message}`); }
    },

    async vectorSearch() {
      let defaultMatches = [];
      let worldMatches = [];
      try {
        const res = await vectorRetrieve(question, { topK, namespace, hints, aiService: aiSvc, pineconeAdapter: pineconeSvc });
        defaultMatches = res.defaultMatches || [];
        worldMatches = res.worldMatches || [];
        meta.vec_default_matches = defaultMatches.length;
        meta.vec_world_matches = worldMatches.length;
      } catch (e) { meta.failures.push(`vector:${e.message}`); }

      const prunedDefault = reRankAndPrune(defaultMatches, { keep: 3, question });
      const prunedWorld = reRankAndPrune(worldMatches, { keep: 1, question });
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
    },

    async worldSearch() {
      const enabled = String(process.env.WORLD_SEARCH_ENABLED || '').toLowerCase();
      if (!['1', 'true', 'yes', 'on'].includes(enabled)) return;

      const threshold = Number(process.env.WORLD_SEARCH_PARTS_THRESHOLD) || 4;
      if (parts.length >= threshold) return;

      const allowed = (meta.allow_domains || []).map(d => String(d).toLowerCase());
      if (allowed.length === 0) return;

      try {
        const { queries, brandTokens, modelTokens } = buildWQ(
          {},
          { allowDomains: allowed, keywords: meta.router_keywords }
        );
        if (!queries.length) return;

        const topKWorld = Math.max(1, Math.min(Number(process.env.WORLD_SEARCH_TOPK) || 2, 5));
        let results = [];
        try {
          results = await serpSearch(queries, { num: topKWorld * 2 });
        } catch (e) {
          meta.failures.push(`serpapi:${e.message}`);
          return;
        }

        const ranked = filterRank(results, {
          brandTokens,
          modelTokens,
          allowDomains: allowed,
          manualKeywords: meta.router_keywords,
          topK: topKWorld
        });

        const seen = new Set();
        for (const r of ranked) {
          try {
            const urlObj = new URL(r.link);
            const host = urlObj.hostname.toLowerCase();
            if (allowed.length && !allowed.some(d => host === d || host.endsWith(`.${d}`))) continue;

            const chunks = await fetchChunk(r.link);
            let addedRef = false;
            for (const ch of chunks) {
              const txt = cleanChunk(ch?.text ?? ch);
              if (!txt) continue;
              const key = txt.slice(0, 160);
              if (seen.has(key)) continue;
              seen.add(key);
              parts.push(txt);
              if (!addedRef) {
                refs.push({ id: r.link, source: r.link, score: 0.2 });
                addedRef = true;
              }
            }
          } catch (err) {
            meta.failures.push(`worldFetch:${err.message}`);
          }
        }
      } catch (e) {
        meta.failures.push(`world:${e.message}`);
      }
    }
  };

  const plan = retrievalConfig[intent] || retrievalConfig.default || Object.keys(steps);
  for (const step of plan) { const fn = steps[step]; if (typeof fn === 'function') await fn(); }

  const references = dedupById(refs);
  const contextText = capContext(cleanChunk(parts.join('\n\n')), 6000);
  return { contextText, references, meta };
}

export default { buildContextMix, classifyQuestion };
