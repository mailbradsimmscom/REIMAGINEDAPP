// src/services/retrieval/sources/AssetSource.js
// Fetch assets via Supabase FTS and normalize output.

import { ENV } from '../../../config/env.js';
import { supabase } from '../../../config/supabase.js';

/**
 * Query the Supabase `search_assets_ft` RPC when both
 * RETRIEVAL_ASSET_ENABLED and RETRIEVAL_FTS_ENABLED are true.
 * Maps casing differences in returned JSON and computes a score
 * from the `rank` field.
 *
 * @param {string} q - FTS query string (e.g., "gps OR chartplotter").
 * @param {object} [opts]
 * @param {number} [opts.limit=10] - Max rows to return.
 * @returns {Promise<object[]>} Normalized asset objects.
 */
export async function AssetSource(q, { limit = 10 } = {}) {
  if (!ENV.RETRIEVAL_ASSET_ENABLED || !ENV.RETRIEVAL_FTS_ENABLED) return [];
  if (!supabase || !q) return [];
  try {
    const { data, error } = await supabase
      .rpc('search_assets_ft', { q, n: limit });
    if (error || !Array.isArray(data)) return [];

    return data.map((row) => {
      const manufacturer = row.Manufacturer ?? row.manufacturer ?? row.data?.Manufacturer ?? row.data?.manufacturer ?? null;
      const description = row.Description ?? row.description ?? row.data?.Description ?? row.data?.description ?? null;
      const model = row.model ?? row.Model ?? row.data?.model ?? row.data?.Model ?? null;
      const score = Number(row.rank ?? row.score ?? 0);
      return {
        id: row.asset_uid ?? row.id ?? null,
        manufacturer,
        model,
        description,
        score,
        source: 'asset',
        raw: row
      };
    }).filter(r => r.id);
  } catch {
    return [];
  }
}

export default AssetSource;
