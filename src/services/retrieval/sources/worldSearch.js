// src/services/retrieval/sources/worldSearch.js
import { ENV } from '../../../config/env.js';
import {
  buildWorldQueries,
  serpapiSearch,
  filterAndRank
} from '../../world/serpapiService.js';
import { fetchAndChunk } from '../../fetch/fetchAndChunk.js';
import { cleanChunk } from '../utils/textProcessing.js';

/**
 * World search step for buildContextMix pipeline
 * Handles web search, content fetching, and snippet extraction
 */
export async function worldSearch({
  parts,
  refs,
  meta,
  webSnippets,
  buildWQ = buildWorldQueries,
  serpSearch = serpapiSearch,
  filterRank = filterAndRank,
  fetchChunk = fetchAndChunk
} = {}) {
  if (!ENV.RETRIEVAL_WEB_ENABLED) return;
  
  const enabled = String(process.env.WORLD_SEARCH_ENABLED || '').toLowerCase();
  if (!['1', 'true', 'yes', 'on'].includes(enabled)) return;

  const threshold = Number(process.env.WORLD_SEARCH_PARTS_THRESHOLD) || 4;
  if (parts.length >= threshold) return;

  const allowDomains = meta.allow_domains.length
    ? meta.allow_domains
    : String(process.env.WORLD_ALLOWLIST || '').split(',');
  const allowed = allowDomains.map(d => String(d).toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return;

  try {
    const router = { allowDomains, keywords: meta.router_keywords };
    const asset = {};
    const { queries } = buildWQ(asset, router);
    if (!queries.length) return;

    const topKWorld = Math.max(1, Math.min(Number(process.env.WORLD_SEARCH_TOPK) || 2, 5));
    let results = [];
    try {
      results = await serpSearch(queries, { num: topKWorld * 2 });
    } catch (e) {
      meta.failures.push(`serpapi:${e.message}`);
      return;
    }

    const ranked = filterRank(results, asset, router, process.env.WORLD_SEARCH_TOPK);

    const seenUrls = new Set();
    for (const r of ranked) {
      try {
        const urlObj = new URL(r.link);
        const host = urlObj.hostname.toLowerCase();
        if (allowed.length && !allowed.some(d => host === d || host.endsWith(`.${d}`))) continue;
        if (seenUrls.has(r.link)) continue;
        seenUrls.add(r.link);

        const chunks = await fetchChunk(r.link);
        let addedRef = false;
        let addedSnippet = false;
        for (const ch of chunks) {
          const txt = cleanChunk(ch?.text ?? ch);
          if (!txt) continue;
          parts.push(txt);
          if (!addedSnippet) {
            webSnippets.push({ url: r.link, text: txt });
            addedSnippet = true;
          }
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

export default { worldSearch };