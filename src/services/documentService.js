import { getClient } from "./supabaseService.js";

export async function listDocuments(boatId) {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("system_knowledge")
    .select("*")
    .eq("boat_id", boatId);
  if (error) throw error;
  return data;
}

export async function getTopics() {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("system_knowledge")
    .select("knowledge_type")
    .not("knowledge_type", "is", null);
  if (error) throw error;
  return [...new Set(data.map(d => d.knowledge_type))];
}
