// src/services/retrieval/sources/PlaybookSource.js
// Fetch playbooks via repository layer

import { searchPlaybooksRPC } from '../../data/repositories/playbookRepository.js';

/**
 * Query playbooks using Supabase RPC when both
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
  return searchPlaybooksRPC(q, { limit });
}

export default PlaybookSource;
