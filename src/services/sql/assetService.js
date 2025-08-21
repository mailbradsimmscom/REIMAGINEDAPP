// src/services/sql/assetService.js
// Service layer for asset operations - delegates to repository layer

import { searchAssets as searchAssetsRepo } from '../data/repositories/assetRepository.js';

/**
 * Search the assets_v2 table using either FTS or ILIKE depending on configuration.
 * `normalizedTokens` should be an array of lowercase keywords.
 * Returns objects with `{ source: 'asset', ...row, score }` sorted by score.
 * 
 * @param {string[]} normalizedTokens - Array of lowercase keywords
 * @param {Object} options - Search options
 * @param {number} [options.limit=10] - Maximum results to return
 * @returns {Promise<Array>} Scored and sorted asset results
 */
export async function searchAssets(normalizedTokens = [], { limit = 10 } = {}) {
  return searchAssetsRepo(normalizedTokens, { limit });
}

export default { searchAssets };

