import supabase from "../config/supabase.js";

export async function getCachedAnswer(intentKey) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("answers_cache")
    .select("*")
    .eq("intent_key", intentKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertCachedAnswer(entry) {
  if (!supabase) return { ok: false };
  const { error } = await supabase.from("answers_cache").insert([entry || {}]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
