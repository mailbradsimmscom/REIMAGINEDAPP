// src/services/sql/knowledgeService.js
// Service layer for knowledge operations - delegates to repository layer

import {
  getBoatSystems as getBoatSystemsRepo,
  findFocusSystem as findFocusSystemRepo,
  getPlaybookSnippets as getPlaybookSnippetsRepo,
  getSystemKnowledgeSnippets as getSystemKnowledgeSnippetsRepo,
  makeSystemHeader as makeSystemHeaderRepo
} from '../data/repositories/knowledgeRepository.js';

/**
 * Get boat systems (single boat setup, so no boat_id filter)
 * @returns {Promise<Object>} { rows: Array, error: string|null }
 */
export async function getBoatSystems() {
  return getBoatSystemsRepo();
}

/**
 * Heuristic to pick a focus system based on the question and available systems
 * @param {string} question - User question
 * @param {Array} systems - Available systems
 * @returns {Object|null} Most relevant system or null if none match
 */
export function findFocusSystem(question, systems = []) {
  return findFocusSystemRepo(question, systems);
}

/**
 * Fetch playbooks likely relevant to a system or the question.
 * Returns up to `linesMax` short snippets with origin='playbook'
 * @param {Object} params - Search parameters
 * @param {string} params.question - User question
 * @param {Object} params.focusSystem - Focus system object
 * @param {number} [params.linesMax=4] - Maximum lines to return
 * @returns {Promise<Object>} { lines: Array, refs: Array, meta: Object }
 */
export async function getPlaybookSnippets({ question, focusSystem, linesMax = 4 }) {
  return getPlaybookSnippetsRepo({ question, focusSystem, linesMax });
}

/**
 * Fetch system_knowledge snippets (single boat setup, no boat_id filter)
 * Returns up to `linesMax` lines with origin='boat_sql'
 * @param {Object} params - Search parameters
 * @param {Object} params.focusSystem - Focus system object
 * @param {string} params.question - User question
 * @param {number} [params.linesMax=6] - Maximum lines to return
 * @returns {Promise<Object>} { lines: Array, refs: Array, meta: Object }
 */
export async function getSystemKnowledgeSnippets({ focusSystem, question, linesMax = 6 }) {
  return getSystemKnowledgeSnippetsRepo({ focusSystem, question, linesMax });
}

/**
 * Optional: build a single-line header for the focus system
 * @param {Object} focusSystem - Focus system object
 * @returns {string|null} System header string or null if no system
 */
export function makeSystemHeader(focusSystem) {
  return makeSystemHeaderRepo(focusSystem);
}
