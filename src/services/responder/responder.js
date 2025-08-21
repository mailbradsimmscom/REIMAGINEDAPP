// src/services/responder/responder.js
// Thin orchestrator for response composition: text sanitization → AI generation → policy enforcement → reference filtering

import { getSystemPreamble } from '../policy/policy.js';
import { generateWithAI } from './ai/aiCoordinator.js';
import { applyPolicyEnforcement } from './policy/policyEnforcer.js';
import { filterUsedReferences } from './references/referenceFilter.js';
import { synthesizeFromContext } from './fallback/fallbackSynthesis.js';

/**
 * Orchestrate response composition through specialized modules
 * Flow: text sanitization → AI generation → policy enforcement → reference filtering
 * @param {Object} params - Response composition parameters
 * @returns {Object} Composed response with all processing applied
 */
export async function composeResponse({
  question,
  contextText,
  references = [],
  tone,
  assets = [],
  playbooks = [],
  webSnippets = []
}) {
  // 1) Get system preamble for AI generation
  const system = getSystemPreamble();

  // 2) Attempt AI generation with coordinated services
  const aiResult = await generateWithAI({
    question,
    contextText,
    references,
    tone,
    assets,
    playbooks,
    webSnippets,
    system
  });

  // 3) Process AI result or fallback
  if (aiResult.success && aiResult.result.rawText) {
    // Apply policy enforcement to AI-generated text
    const finalText = applyPolicyEnforcement(aiResult.result.rawText);
    
    // Filter references to only those mentioned in the final text
    const finalRefs = filterUsedReferences(finalText, aiResult.result.combinedRefs).slice(0, 12);

    return {
      title: aiResult.result.title,
      summary: aiResult.result.summary,
      bullets: aiResult.result.bullets,
      cta: aiResult.result.cta,
      assets, 
      playbooks, 
      webSnippets,
      raw: { text: finalText, references: finalRefs }
    };
  }

  // 4) Fallback synthesis when AI generation fails
  const synth = synthesizeFromContext({ contextText, references });
  synth.raw.references = filterUsedReferences(synth.raw.text, synth.raw.references).slice(0, 12);
  return { ...synth, assets, playbooks, webSnippets };
}

export default { composeResponse };
