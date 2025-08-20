import { sb } from '../../lib/supabase.js';

export async function searchAssetsFT(q, n = 10) {
  const { data, error } = await sb.rpc('search_assets_ft', { q, n });
  if (error) throw error;
  // data: array of JSON rows (no casing issues)
  return Array.isArray(data) ? data : [];
}

export async function searchPlaybooksFT(q, n = 10) {
  const { data, error } = await sb.rpc('search_playbooks_ft', { q, n });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
