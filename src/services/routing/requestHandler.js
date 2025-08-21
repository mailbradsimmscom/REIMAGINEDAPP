// src/services/routing/requestHandler.js
// Handles request validation and parameter extraction for BFF routes

import { ValidationError } from '../../utils/errors.js';

/**
 * Validate request and extract parameters with proper error handling
 * @param {Object} req - Express request object
 * @returns {Object} Validated and extracted parameters
 * @throws {ValidationError} If validation fails
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
    throw new ValidationError('Question is required and cannot be empty', 'question');
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