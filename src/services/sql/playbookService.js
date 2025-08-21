// src/services/sql/playbookService.js
// Service layer for playbook operations - delegates to repository layer

import { 
  searchPlaybooks as searchPlaybooksRepo, 
  formatPlaybookBlock as formatPlaybookBlockRepo,
  derivePlaybookKeywords as derivePlaybookKeywordsRepo
} from '../data/repositories/playbookRepository.js';

/**
 * Derive meaningful keywords strictly from the user's text.
 * - lowercase
 * - drop stopwords  
 * - keep only 3..32 chars
 * 
 * @param {string} question - User question
 * @returns {string[]} Array of filtered keywords
 */
export function derivePlaybookKeywords(question = '') {
  return derivePlaybookKeywordsRepo(question);
}

/**
 * Normalize one playbook row into a block object.
 * 
 * @param {Object} row - Raw playbook database row
 * @returns {Object|null} Formatted playbook block or null if invalid
 */
export function formatPlaybookBlock(row) {
  return formatPlaybookBlockRepo(row);
}

/**
 * Search Supabase "standards_playbooks" using real keywords.
 * We:
 *  - bail if no meaningful keywords
 *  - OR-search title+summary for the first few keywords
 *  - search matchers/triggers arrays for each keyword
 *  - dedup + score by keyword coverage; return top N
 * 
 * @param {string} question - User question
 * @param {Object} options - Search options
 * @param {number} [options.limit=5] - Maximum results to return
 * @returns {Promise<Array>} Scored and sorted playbook results
 */
export async function searchPlaybooks(question, { limit = 5 } = {}) {
  return searchPlaybooksRepo(question, { limit });
}

export default { searchPlaybooks, formatPlaybookBlock, derivePlaybookKeywords };
