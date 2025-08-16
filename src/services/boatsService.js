import { getClient } from "./supabaseService.js";

export async function getBoatProfile(id) {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("boat_profile")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listBoatSystems(boatId) {
  const supabase = getClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("boat_systems")
    .select("*")
    .eq("boat_id", boatId);
  if (error) throw error;
  return data;
}
