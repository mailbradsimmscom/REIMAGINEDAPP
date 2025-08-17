// src/services/sql/persistenceService.js
// Non-blocking persistence for conversations & feedback.

import { supabase } from '../../config/supabase.js';

export async function persistConversation({
  boatId,
  question,
  answerText,
  confidence,
  sourcesUsed,
  wasHelpful = null,
  learnedFacts = null
}) {
  if (!supabase) return { ok: false, reason: 'no_supabase' };

  const { error } = await supabase
    .from('boat_conversations')
    .insert([{
      boat_id: boatId || null,
      user_question: question || '',
      ai_response: answerText || '',
      confidence_score: typeof confidence === 'number' ? confidence : null,
      sources_used: sourcesUsed || null,
      was_helpful: wasHelpful,
      learned_facts: learnedFacts || null
    }]);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
