// src/services/feedbackService.js
import { supabase } from '../config/supabase.js';

/**
 * Insert end-user feedback into qa_feedback.
 * Maps fields from BFF/API payload to DB columns.
 */
export async function insertFeedback({
  question,
  answerId,
  thumb,       // 'up' | 'down' | null
  reason,      // freeform text
  intent,
  entities,    // json
  evidenceIds  // json/array
}) {
  if (!supabase) return { ok: false, error: 'Supabase not initialized' };

  const payload = {
    question: question || null,
    answer_id: answerId || null,
    thumb: thumb || null,
    reason: reason || null,
    intent: intent || null,
    entities: entities ?? null,
    evidence_ids: evidenceIds ?? null
  };

  const { error } = await supabase.from('qa_feedback').insert([payload]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
