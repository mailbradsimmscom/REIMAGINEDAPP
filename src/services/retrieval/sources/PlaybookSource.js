// src/services/retrieval/sources/PlaybookSource.js
// Fetch playbooks via Supabase FTS and normalize output.

import { ENV } from '../../../config/env.js';
import { supabase } from '../../../config/supabase.js';

/**
 * Query the Supabase `search_playbooks_ft` RPC when both
 * RETRIEVAL_PLAYBOOK_ENABLED and RETRIEVAL_FTS_ENABLED are true.
 * Maps casing differences in returned JSON and computes a score
 * from the `rank` field plus keyword hits in title, summary,
 * model keys, and triggers.
 *
 * @param {string} q - FTS query string (e.g., "gps OR chartplotter").
 * @param {object} [opts]
 * @param {number} [opts.limit=10] - Max rows to return.
 * @returns {Promise<object[]>} Normalized playbook objects.
 */
export async function PlaybookSource(q, { limit = 10 } = {}) {
  if (!ENV.RETRIEVAL_PLAYBOOK_ENABLED || !ENV.RETRIEVAL_FTS_ENABLED) return [];
  if (!supabase || !q) return [];
  try {
    const { data, error } = await supabase
      .rpc('search_playbooks_ft', { q, n: limit });
    if (error || !Array.isArray(data)) return [];

    const kws = String(q).toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);

    const toArray = (v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v.trim()) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        return v.split(/[\s,]+/).filter(Boolean);
      }
      return [];
    };

    return data.map((row) => {
      const title = row.title ?? row.Title ?? row.data?.title ?? row.data?.Title ?? '';
      const summary = row.summary ?? row.Summary ?? row.data?.summary ?? row.data?.Summary ?? '';
      const modelKeys = toArray(row.model_keys ?? row.modelKeys ?? row.data?.model_keys ?? row.data?.modelKeys);
      const triggers = toArray(row.triggers ?? row.Triggers ?? row.data?.triggers ?? row.data?.Triggers);
      let score = Number(row.rank ?? row.score ?? 0);

      const lt = String(title).toLowerCase();
      const ls = String(summary).toLowerCase();
      const mk = modelKeys.map(m => String(m).toLowerCase());
      const tr = triggers.map(t => String(t).toLowerCase());
      for (const kw of kws) {
        if (lt.includes(kw)) score += 3;
        if (ls.includes(kw)) score += 1;
        if (mk.some(m => m.includes(kw))) score += 4;
        if (tr.some(t => t.includes(kw))) score += 3;
      }

      return {
        id: row.id ?? row.playbook_id ?? row.playbook_uid ?? null,
        title,
        summary,
        modelKeys,
        triggers,
        score,
        source: 'playbook',
        raw: row
      };
    }).filter(r => r.id);
  } catch {
    return [];
  }
}

export default PlaybookSource;
