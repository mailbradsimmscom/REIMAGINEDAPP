// src/services/serialization/responseSerializer.js
// Handles response serialization for different client types with payload enrichment

import { webSerializer, apiSerializer } from '../../views/serializers.js';
import { setTrace } from '../debug/traceStore.js';
import { config } from '../../config/index.js';

/**
 * Serialize response for client with appropriate enrichment
 * @param {Object} params - Serialization parameters
 * @param {Object} params.structured - The structured response data
 * @param {string} params.client - Client type ('api' or 'web')
 * @param {Object} params.retrievalMeta - Retrieval metadata
 * @param {Object} params.retrieval - Retrieval metrics object
 * @param {boolean} params.debug - Debug flag
 * @param {boolean} params.fromCache - Cache hit indicator
 * @param {string} params.requestId - Request ID for tracing
 * @param {string} params.question - Original question for tracing
 * @returns {Object} Serialized and enriched payload
 */
export function serializeResponse({
  structured,
  client = 'web',
  retrievalMeta,
  retrieval,
  debug = false,
  fromCache = false,
  requestId,
  question
}) {
  // 1) Client-specific serialization
  let payload = client === 'api'
    ? apiSerializer(structured)
    : (() => {
        const out = webSerializer(structured);
        out._structured = structured;
        return out;
      })();

  // 2) Enrich with assets and playbooks
  payload.assets = Array.isArray(structured?.assets) ? structured.assets : [];
  payload.playbooks = Array.isArray(structured?.playbooks) ? structured.playbooks : [];

  // 3) Attach retrieval metadata if enabled
  if (retrievalMeta && config.RETRIEVAL_TELEMETRY_ENABLED) {
    setTrace(requestId, { question, meta: retrievalMeta });
    payload._retrievalMeta = retrievalMeta;
  }

  // 4) Add debug information if requested
  if (debug) {
    payload._retrieval = retrieval;
  }

  // 5) Add cache hit indicator
  if (fromCache) {
    payload._cache = { hit: true };
  }

  return payload;
}

export default { serializeResponse };