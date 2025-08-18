import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TABLE = 'system_knowledge';

export async function upsertDoc({ id, boat_id, system_id, knowledge_type, title, content, source, tags, version }) {
  const row = { id, boat_id, system_id, knowledge_type, title, content, source, tags, version, deleted_at: null };
  const { data, error } = await supabase.from(TABLE).upsert(row).select().single();
  if (error) throw error;
  return data; // includes id
}

export async function getDoc(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function updateDocVersionAndContent(id, patch) {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function softDeleteDoc(id) {
  const { data, error } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
