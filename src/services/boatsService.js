import supabase from "../config/supabase.js";

// Single-boat setup: fetch all systems without requiring a boat id
export async function listBoatSystems() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("boat_systems")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

