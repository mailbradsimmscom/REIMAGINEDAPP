// src/services/retrieval/legacyCoordinator.js
// Coordinates legacy retrieval using the traditional mixer/orchestrator pattern

import { composeResponse } from '../responder/responder.js';
import { classifyQuestion } from './mixerService.js';
import { runRetrieval } from './orchestrator.js';

/**
 * Handle legacy retrieval path using traditional mixer/orchestrator pattern
 * @param {Object} params - Request parameters
 * @param {string} params.question - The user question
 * @param {string} params.tone - Response tone
 * @param {string} params.namespace - Vector namespace
 * @param {number} params.topK - Number of results to retrieve
 * @param {string} params.clientIntent - Client-provided intent
 * @param {string} params.requestId - Request ID for tracing
 * @param {Object} params.retrieval - Retrieval metrics object to update
 * @returns {Object} { structured, retrievalMeta, contextText, refs }
 */
export async function handleLegacyRetrieval({
  question,
  tone,
  namespace,
  topK,
  clientIntent,
  requestId,
  retrieval
}) {
  // 1) Intent classification (use client intent or classify)
  const intent = clientIntent || await classifyQuestion(question);
  
  // 2) Run traditional retrieval mix (vector + playbook + asset + world)
  const mix = await runRetrieval({
    question,
    namespace,
    topK,
    requestId,
    intent
  });

  // 3) Extract results and update metrics
  const contextText = mix.contextText || '';
  const refs = Array.isArray(mix.references) ? mix.references : [];
  const retrievalMeta = mix.meta || null;
  
  // Update retrieval metrics (preserve existing counts from FTS if any)
  retrieval.assets = Array.isArray(mix.assets) ? mix.assets.length : retrieval.assets;
  retrieval.playbooks = Array.isArray(mix.playbooks) ? mix.playbooks.length : retrieval.playbooks;
  retrieval.web = Array.isArray(mix.webSnippets) ? mix.webSnippets.length : retrieval.web;

  // 4) Compose final response
  const structured = await composeResponse({
    question,
    contextText,
    references: refs,
    tone,
    assets: Array.isArray(mix.assets) ? mix.assets : [],
    playbooks: Array.isArray(mix.playbooks) ? mix.playbooks : [],
    webSnippets: Array.isArray(mix.webSnippets) ? mix.webSnippets : []
  });

  return {
    structured,
    retrievalMeta,
    contextText,
    refs
  };
}

export default { handleLegacyRetrieval };