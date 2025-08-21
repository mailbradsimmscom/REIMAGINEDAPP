// src/services/retrieval/sources/assetSearch.js
import { ENV } from '../../../config/env.js';
import { searchAssets } from '../../sql/assetService.js';

/**
 * Asset search step for buildContextMix pipeline
 * Handles asset discovery, text formatting, and metadata tracking
 */
export async function assetSearch({
  hints,
  parts,
  refs,
  assets,
  meta,
  searchAS = searchAssets
} = {}) {
  if (!ENV.RETRIEVAL_ASSET_ENABLED) return;
  
  try {
    if (!hints || hints.length === 0) return;
    
    const assetsRes = await searchAS(hints, { limit: 3 });
    meta.asset_rows += assetsRes.length;
    
    for (const a of assetsRes) {
      const text = [
        [a.manufacturer, a.model].filter(Boolean).join(' '),
        a.description,
        a.notes
      ].filter(Boolean).join('. ');
      
      if (text) parts.push(text);
      
      refs.push({ 
        id: a.id, 
        source: a.source || 'asset', 
        score: Math.min(0.8, (a.score || 1) / 10 + 0.6) 
      });
      
      assets.push({
        id: a.id,
        manufacturer: a.manufacturer,
        model: a.model,
        description: a.description,
        notes: a.notes,
        source: a.source || 'asset'
      });
      
      meta.asset_selected += 1;
    }
  } catch (e) { 
    meta.failures.push(`asset:${e.message}`); 
  }
}

export default { assetSearch };