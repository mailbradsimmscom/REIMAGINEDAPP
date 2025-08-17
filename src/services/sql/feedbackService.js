// src/services/sql/feedbackService.js
import { supabase } from '../../config/supabase.js';

export async function saveFeedback({
  question,
  answer_id,    // optional (your own UUID/string for the answer)
  thumb,        // 'up' | 'down' | 'neutral'
  reason,       // free text from user
  intent,       // optional tag
  entities,     // json object of extracted entities
  evidence_ids  // array of doc ids shown to user
}) {
  if (!supabase) return { ok: false, error: 'no_supabase' };

  const { error } = await supabase
    .from('qa_feedback')
    .insert([{
      question: question || '',
      answer_id: answer_id || null,
      thumb: thumb || null,
      reason: reason || null,
      intent: intent || null,
      entities: entities || null,
      evidence_ids: Array.isArray(evidence_ids) ? evidence_ids : null
    }]);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
