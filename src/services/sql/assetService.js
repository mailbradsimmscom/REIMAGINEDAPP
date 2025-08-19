// src/services/sql/assetService.js
import { supabase } from '../../config/supabase.js';

const norm = (s) => String(s || '').toLowerCase();

/**
 * Search the assets_v2 table using FTS if available, falling back to ILIKE.
 * `normalizedTokens` should be an array of lowercase keywords.
 * Returns objects with `{ source: 'asset', ...row, score }` sorted by score.
 */
export async function searchAssets(normalizedTokens = [], { limit = 10 } = {}) {
  if (!supabase) return [];

  const tokens = Array.isArray(normalizedTokens)
    ? normalizedTokens.filter(Boolean).map(norm)
    : [];
  if (!tokens.length) return [];

  const selectCols = 'id, model_key, model, manufacturer, system, category, tags, notes, description, instance_index';
  let rows = [];

  // --- Try full text search on the fts column
  try {
    const ftsQuery = tokens.map(t => `${t}:*`).join(' & ');
    const { data, error } = await supabase
      .from('assets_v2')
      .select(selectCols)
      .textSearch('fts', ftsQuery, { type: 'plain' })
      .limit(50);
    if (!error && Array.isArray(data) && data.length) rows = data;
  } catch {}

  // --- Fallback ILIKE OR search across relevant fields
  if (!rows.length) {
    const ors = [];
    for (const t of tokens.slice(0, 5)) {
      const pat = `%${t}%`;
      ors.push(`model_key.ilike.${pat}`);
      ors.push(`model.ilike.${pat}`);
      ors.push(`manufacturer.ilike.${pat}`);
      ors.push(`system.ilike.${pat}`);
      ors.push(`category.ilike.${pat}`);
      ors.push(`tags.ilike.${pat}`);
      ors.push(`notes.ilike.${pat}`);
      ors.push(`description.ilike.${pat}`);
    }
    if (ors.length) {
      try {
        const { data, error } = await supabase
          .from('assets_v2')
          .select(selectCols)
          .or(ors.join(','))
          .limit(50);
        if (!error && Array.isArray(data)) rows = data;
      } catch {}
    }
  }

  if (!rows.length) return [];

  // --- Score rows
  const scored = rows.map(r => {
    let score = 0;
    const modelText = `${norm(r.model_key)} ${norm(r.model)}`;
    const manufacturerText = norm(r.manufacturer);
    const sysText = [r.system, r.category, r.tags, r.notes].map(norm).join(' ');
    const descText = norm(r.description);

    for (const t of tokens) {
      if (modelText.includes(t)) score += 5;            // model match
      if (manufacturerText.includes(t)) score += 3;     // manufacturer match
      if (sysText.includes(t)) score += 2;              // system/category/tags/notes
      if (descText.includes(t)) score += 1;             // description match
    }

    const idx = Number(r.instance_index);
    if (Number.isFinite(idx)) score += 1 / (idx + 1);   // instance_index boost

    return { ...r, source: 'asset', score };
  })
  .filter(r => r.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, Math.max(1, limit));

  return scored;
}

export default { searchAssets };

