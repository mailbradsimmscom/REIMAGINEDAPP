// src/services/data/repositories/assetRepository.js
// Repository layer for asset database operations

import { supabase } from '../../../config/supabase.js';
import { config } from '../../../config/index.js';

const norm = (s) => String(s || '').toLowerCase();

/**
 * Run full text search against the `fts` column in assets_v2
 * @param {string[]} tokens - Search tokens
 * @param {string} selectCols - Column selection string
 * @returns {Promise<Array>} Search results
 */
async function searchAssetsFTS(tokens, selectCols) {
  try {
    const ftsQuery = tokens.map(t => `${t}:*`).join(' & ');
    const { data, error } = await supabase
      .from('assets_v2')
      .select(selectCols)
      .textSearch('fts', ftsQuery, { type: 'plain' })
      .limit(50);
    if (!error && Array.isArray(data)) return data;
  } catch {
    // Fallback silently on FTS errors
  }
  return [];
}

/**
 * Run ILIKE search across multiple asset columns
 * @param {string[]} tokens - Search tokens
 * @param {string} selectCols - Column selection string
 * @returns {Promise<Array>} Search results
 */
async function searchAssetsILike(tokens, selectCols) {
  const ors = [];
  for (const t of tokens.slice(0, 5)) {
    const pat = `%${t}%`;
    ors.push(`model_key.ilike.${pat}`);
    ors.push(`model.ilike.${pat}`);
    ors.push(`manufacturer.ilike.${pat}`);
    ors.push(`system.ilike.${pat}`);
    ors.push(`category.ilike.${pat}`);
    ors.push(`tags.ilike.${pat}`);
    ors.push(`notes.ilike.${pat}`);
    ors.push(`description.ilike.${pat}`);
  }
  if (!ors.length) return [];
  
  try {
    const { data, error } = await supabase
      .from('assets_v2')
      .select(selectCols)
      .or(ors.join(','))
      .limit(50);
    if (!error && Array.isArray(data)) return data;
  } catch {
    // Fallback silently on ILIKE errors
  }
  return [];
}

/**
 * Calculate relevance score for an asset based on token matches
 * @param {Object} asset - Asset record
 * @param {string[]} tokens - Search tokens
 * @returns {number} Relevance score
 */
function calculateAssetScore(asset, tokens) {
  let score = 0;
  const modelText = `${norm(asset.model_key)} ${norm(asset.model)}`;
  const manufacturerText = norm(asset.manufacturer);
  const sysText = [asset.system, asset.category, asset.tags, asset.notes].map(norm).join(' ');
  const descText = norm(asset.description);

  for (const token of tokens) {
    if (modelText.includes(token)) score += 8;            // model match
    if (manufacturerText.includes(token)) score += 5;     // manufacturer match
    if (sysText.includes(token)) score += 3;              // system/category/tags/notes
    if (descText.includes(token)) score += 1;             // description match
  }

  // Instance index boost (higher index = lower priority)
  const idx = Number(asset.instance_index);
  if (Number.isFinite(idx)) score += 1 / (idx + 1);

  return score;
}

/**
 * Search assets using either FTS or ILIKE based on configuration
 * @param {string[]} normalizedTokens - Array of lowercase search tokens
 * @param {Object} options - Search options
 * @param {number} [options.limit=10] - Maximum results to return
 * @returns {Promise<Array>} Scored and sorted asset results
 */
export async function searchAssets(normalizedTokens = [], { limit = 10 } = {}) {
  if (!supabase) return [];

  const tokens = Array.isArray(normalizedTokens)
    ? normalizedTokens.filter(Boolean).map(norm)
    : [];
  if (!tokens.length) return [];

  const selectCols = 'id, model_key, model, manufacturer, system, category, tags, notes, description, instance_index';
  
  // Choose search strategy based on FTS configuration
  const rows = config.RETRIEVAL_FTS_ENABLED
    ? await searchAssetsFTS(tokens, selectCols)
    : await searchAssetsILike(tokens, selectCols);

  if (!rows.length) return [];

  // Score and sort results
  const scored = rows
    .map(asset => ({
      id: asset.id,
      model_key: asset.model_key,
      model: asset.model,
      manufacturer: asset.manufacturer,
      system: asset.system,
      category: asset.category,
      tags: asset.tags,
      notes: asset.notes,
      description: asset.description,
      instance_index: asset.instance_index,
      source: 'asset',
      score: calculateAssetScore(asset, tokens)
    }))
    .filter(asset => asset.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return scored;
}

/**
 * Search assets using Supabase RPC for full-text search
 * @param {string} query - FTS query string
 * @param {Object} options - Search options
 * @param {number} [options.limit=10] - Maximum results to return
 * @returns {Promise<Array>} Normalized asset results with scores
 */
export async function searchAssetsRPC(query, { limit = 10 } = {}) {
  if (!config.RETRIEVAL_ASSET_ENABLED || !config.RETRIEVAL_FTS_ENABLED) return [];
  if (!supabase || !query) return [];
  
  try {
    const { data, error } = await supabase
      .rpc('search_assets_ft', { q: query, n: limit });
    if (error || !Array.isArray(data)) return [];

    return data.map((row) => {
      // Handle various casing differences in returned JSON
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
    }).filter(result => result.id);
  } catch {
    return [];
  }
}

export default {
  searchAssets,
  searchAssetsRPC
};