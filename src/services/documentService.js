// src/services/documentService.js
import { supabase } from '../config/supabase.js';

/** === Reads (you already had listDocuments/listTopics) === */

export async function listDocuments() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('system_knowledge')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listTopics() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('system_knowledge')
    .select('knowledge_type')
    .not('knowledge_type', 'is', null);
  if (error) throw new Error(error.message);
  const uniq = new Set();
  for (const row of data || []) if (row.knowledge_type) uniq.add(row.knowledge_type);
  return Array.from(uniq).sort((a, b) => a.localeCompare(b));
}

export async function getDoc(id) {
  const { data, error } = await supabase.from('system_knowledge').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

/** === Mutations we need for ingest/update/delete === */

export async function upsertDoc({ id, system_id, knowledge_type, title, content, source, tags, version }) {
  const row = { id, system_id, knowledge_type, title, content, source, tags, version, deleted_at: null };
  const { data, error } = await supabase.from('system_knowledge').upsert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDocVersionAndContent(id, patch) {
  const { data, error } = await supabase.from('system_knowledge').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function softDeleteDoc(id) {
  const { data, error } = await supabase.from('system_knowledge').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export default {
  listDocuments,
  listTopics,
  getDoc,
  upsertDoc,
  updateDocVersionAndContent,
  softDeleteDoc
};
