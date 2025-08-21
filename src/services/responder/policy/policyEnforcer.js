// src/services/responder/policy/policyEnforcer.js
// Handles policy enforcement and text normalization

import { enforcePolicySections } from '../../policy/policy.js';

/**
 * Apply policy enforcement to text with fallback handling
 * @param {string} rawText - Raw text to enforce policy on
 * @returns {string} Policy-enforced text with fallback to raw if empty
 */
export function applyPolicyEnforcement(rawText = '') {
  const shaped = enforcePolicySections(rawText);
  const finalText = shaped && shaped.trim() ? shaped : rawText;
  
  if (!shaped || !shaped.trim()) {
    console.warn('[policy] shaped text was empty — using raw text');
  }
  
  return finalText;
}

export default { applyPolicyEnforcement };