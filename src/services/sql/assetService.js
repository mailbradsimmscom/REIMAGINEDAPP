// src/services/sql/assetService.js
import { supabase } from '../../config/supabase.js';

const norm = (s) => String(s || '').toLowerCase();

const FTS_ENABLED = String(process.env.RETRIEVAL_FTS_ENABLED || '').toLowerCase() === 'true';

// Run a full text search against the `fts` column
async function ftsSearch(tokens, selectCols) {
  try {
    const ftsQuery = tokens.map(t => `${t}:*`).join(' & ');
    const { data, error } = await supabase
      .from('assets_v2')
      .select(selectCols)
      .textSearch('fts', ftsQuery, { type: 'plain' })
      .limit(50);
    if (!error && Array.isArray(data)) return data;
  } catch {}
  return [];
}

// Run a broad OR ILIKE search across several columns
async function ilikeSearch(tokens, selectCols) {
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
  if (!ors.length) return [];
  try {
    const { data, error } = await supabase
      .from('assets_v2')
      .select(selectCols)
      .or(ors.join(','))
      .limit(50);
    if (!error && Array.isArray(data)) return data;
  } catch {}
  return [];
}

/**
 * Search the assets_v2 table using either FTS or ILIKE depending on
 * `process.env.RETRIEVAL_FTS_ENABLED`.
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
  const rows = FTS_ENABLED
    ? await ftsSearch(tokens, selectCols)
    : await ilikeSearch(tokens, selectCols);

  if (!rows.length) return [];

  // --- Score rows
  const scored = rows.map(r => {
    let score = 0;
    const modelText = `${norm(r.model_key)} ${norm(r.model)}`;
    const manufacturerText = norm(r.manufacturer);
    const sysText = [r.system, r.category, r.tags, r.notes].map(norm).join(' ');
    const descText = norm(r.description);

    for (const t of tokens) {
      if (modelText.includes(t)) score += 8;            // model match
      if (manufacturerText.includes(t)) score += 5;     // manufacturer match
      if (sysText.includes(t)) score += 3;              // system/category/tags/notes
      if (descText.includes(t)) score += 1;             // description match
    }

    const idx = Number(r.instance_index);
    if (Number.isFinite(idx)) score += 1 / (idx + 1);   // instance_index boost

    return {
      id: r.id,
      model_key: r.model_key,
      model: r.model,
      manufacturer: r.manufacturer,
      system: r.system,
      category: r.category,
      tags: r.tags,
      notes: r.notes,
      description: r.description,
      instance_index: r.instance_index,
      source: 'asset',
      score
    };
  })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));

  return scored;
}

export default { searchAssets };

