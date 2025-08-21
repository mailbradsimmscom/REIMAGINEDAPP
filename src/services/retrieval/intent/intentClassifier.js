// src/services/retrieval/intent/intentClassifier.js
import * as ai from '../../ai/aiService.js';
import intentConfig from '../intentConfig.json' with { type: 'json' };

/* ---------- Intent classifier ---------- */
export async function classifyQuestion(question = '') {
  const q = String(question).toLowerCase();
  const rules = intentConfig?.intents || intentConfig || {};
  for (const [intent, rule] of Object.entries(rules)) {
    const { all = [], any = [] } = rule || {};
    const allMatch = all.every(p => new RegExp(p, 'i').test(q));
    const anyMatch = any.length === 0 || any.some(p => new RegExp(p, 'i').test(q));
    if (allMatch && anyMatch) return intent;
  }
  if (typeof ai.classifyIntent === 'function') {
    try {
      const aiIntent = await ai.classifyIntent(question);
      if (aiIntent) return aiIntent;
    } catch { /* ignore */ }
  }
  return 'generic';
}

export default { classifyQuestion };