// src/services/documentService.js
import { supabase } from '../config/supabase.js';

/**
 * List documents from system_knowledge.
 * If boatId is provided, filters by boat_id.
 */
export async function listDocuments(boatId) {
  if (!supabase) return [];

  let q = supabase.from('system_knowledge').select('*').order('updated_at', { ascending: false });
  if (boatId) q = q.eq('boat_id', boatId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Return distinct knowledge_type values from system_knowledge.
 */
export async function getTopics() {
  if (!supabase) return [];

  // Safer for compatibility: fetch non-null and uniq in JS
  const { data, error } = await supabase
    .from('system_knowledge')
    .select('knowledge_type')
    .not('knowledge_type', 'is', null);

  if (error) throw new Error(error.message);

  const uniq = new Set();
  for (const row of data || []) {
    if (row.knowledge_type && typeof row.knowledge_type === 'string') {
      uniq.add(row.knowledge_type);
    }
  }
  return Array.from(uniq).sort((a, b) => a.localeCompare(b));
}
