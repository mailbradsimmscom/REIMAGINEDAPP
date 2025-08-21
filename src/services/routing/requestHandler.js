// src/services/routing/requestHandler.js
// Handles request validation and parameter extraction for BFF routes

/**
 * Validate request and extract parameters with proper error handling
 * @param {Object} req - Express request object
 * @returns {Object} Validated and extracted parameters
 * @throws {Error} If validation fails (with status property for HTTP response)
 */
export function validateAndExtractParams(req) {
  // Extract parameters from request body
  const {
    question,
    tone,
    namespace,
    topK,
    context,
    references,
    intent: clientIntent,
    debug: debugFlag
  } = req.body || {};

  // Extract request metadata
  const requestId = req.id;
  const debug = Boolean(debugFlag || req.query?.debug);

  // Validate required question parameter
  if (!question || !String(question).trim()) {
    const error = new Error('Missing question');
    error.status = 400;
    error.response = { ok: false, error: 'Missing question' };
    throw error;
  }

  // Return validated parameters
  return {
    question: String(question).trim(),
    tone,
    namespace,
    topK,
    context,
    references,
    clientIntent,
    requestId,
    debug
  };
}

export default { validateAndExtractParams };