// src/services/telemetry/retrievalTelemetry.js
// Handles background telemetry recording including confidence calculation and persistence

import { persistConversation } from '../sql/persistenceService.js';
import { config } from '../../config/index.js';

/**
 * Record telemetry data in background with confidence calculation
 * @param {Object} params - Telemetry parameters
 * @param {string} params.question - Original user question
 * @param {Object} params.structured - Structured response data
 */
export function recordTelemetry({ question, structured }) {
  // Only record if telemetry is enabled
  if (!config.RETRIEVAL_TELEMETRY_ENABLED) {
    return;
  }

  // Execute in background (non-blocking)
  (async () => {
    try {
      // Calculate confidence from top reference scores
      const topScores = (structured?.raw?.references || [])
        .map(r => r?.score)
        .filter(s => typeof s === 'number')
        .sort((a, b) => b - a)
        .slice(0, 3);

      const confidence = topScores.length
        ? topScores.reduce((a, b) => a + b, 0) / topScores.length
        : null;

      // Map sources for persistence
      const sourcesUsed = (structured?.raw?.references || []).map(r => ({
        id: r?.id,
        source: r?.source,
        score: r?.score
      }));

      // Persist conversation data
      await persistConversation({
        question,
        answerText: structured?.raw?.text || '',
        confidence,
        sourcesUsed
      });
    } catch (e) {
      // Only log errors in non-production environments
      if (config.NODE_ENV !== 'production') {
        console.warn('[persist/cache] error:', e.message);
      }
    }
  })();
}

export default { recordTelemetry };