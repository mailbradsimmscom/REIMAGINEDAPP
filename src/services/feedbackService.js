import { getClient } from "./supabaseService.js";

export async function insertFeedback({ question, answerId, thumb, reason, intent, entities, evidenceIds }) {
  const supabase = getClient();
  if (!supabase) return { ok: false, error: "No Supabase client" };
  const { error } = await supabase.from("qa_feedback").insert([{
    question,
    answer_id: answerId,
    thumb,
    reason,
    intent,
    entities,
    evidence_ids: evidenceIds
  }]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
