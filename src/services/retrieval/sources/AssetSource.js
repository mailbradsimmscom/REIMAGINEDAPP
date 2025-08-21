// src/services/retrieval/sources/AssetSource.js
// Fetch assets via repository layer

import { searchAssetsRPC } from '../../data/repositories/assetRepository.js';

/**
 * Query assets using Supabase RPC when both
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
  return searchAssetsRPC(q, { limit });
}

export default AssetSource;
