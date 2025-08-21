// src/services/retrieval/sources/playbookSearch.js
import { ENV } from '../../../config/env.js';
import {
  searchPlaybooks,
  formatPlaybookBlock,
  derivePlaybookKeywords
} from '../../sql/playbookService.js';

/**
 * Playbook search step for buildContextMix pipeline
 * Handles playbook discovery, formatting, domain extraction, and keyword routing
 */
export async function playbookSearch({
  question,
  hints,
  playbooks,
  refs,
  meta,
  searchPB = searchPlaybooks,
  formatPB = formatPlaybookBlock,
  deriveKW = derivePlaybookKeywords
} = {}) {
  if (!ENV.RETRIEVAL_PLAYBOOK_ENABLED) return;
  
  try {
    // Only run when there are meaningful hints (prevents "match everything")
    if (!hints || hints.length === 0) return;

    const pbs = await searchPB(question, { limit: 3 });
    meta.sql_rows += pbs.length;

    for (const pb of pbs.slice(0, 2)) {
      const block = formatPB(pb);
      if (!block) continue;
      playbooks.push(block);

      // Extract reference domains for world search allowlist
      if (Array.isArray(pb.ref_domains) && pb.ref_domains.length) {
        meta.allow_domains = Array.from(new Set([
          ...meta.allow_domains,
          ...pb.ref_domains
        ]));
      }

      // Extract keywords for routing and world search
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

      // Add reference with high confidence score
      refs.push({
        id: block.id,
        source: block.source,
        score: Math.min(0.95, (pb.score || 1) / 10 + 0.85)
      });
      meta.sql_selected += 1;
    }
    if (meta.sql_selected > 0) meta.playbook_hit = true;
  } catch (e) { 
    meta.failures.push(`playbooks:${e.message}`); 
  }
}

export default { playbookSearch };