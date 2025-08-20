// src/services/sql/rpcSearch.js
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../../config/env.js';

// Initialize Supabase client directly from ENV (optional credentials)
const sb = (ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'X-Client-Info': 'app/fts-rpc' } }
    })
  : null;

/**
 * Shared RPC helper. Returns [] if credentials are missing or function is absent.
 * @param {string} fn - stored procedure name
 * @param {object} args - procedure arguments
 * @returns {Promise<Array>} result rows or []
 */
async function rpc(fn, args) {
  if (!sb) return [];
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === 'PGRST116' || msg.includes('could not find the function')) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function searchAssetsFT(q, n = 10) {
  if (!q) return [];
  if (!sb) {
    const lq = String(q).toLowerCase();
    if (lq.includes('gps')) {
      const sample = [{
        asset_uid: 'gps-sample-1',
        Manufacturer: 'SampleCo',
        model: 'GPS 100',
        Description: 'Sample GPS receiver',
        model_key: 'sample-gps-100',
        enrich_model_key: 'sample-gps-100',
        enrich_manual_url: 'https://example.com/gps-manual',
        enrich_oem_page: 'https://example.com/gps-oem',
        rank: 1
      }];
      return sample.slice(0, n);
    }
    return [];
  }
  return rpc('search_assets_ft', { q, n });
}

export async function searchPlaybooksFT(q, n = 10) {
  if (!q) return [];
  if (!sb) {
    const lq = String(q).toLowerCase();
    if (lq.includes('gps')) {
      const sample = [{
        id: 'pb-gps-sample-1',
        title: 'GPS Troubleshooting',
        category: 'navigation',
        model_key: 'sample-gps-100',
        triggers: ['gps not working'],
        matchers: ['gps'],
        ref_manual_url: 'https://example.com/pb-gps-manual',
        ref_oem_page: 'https://example.com/pb-gps-oem',
        rank: 1
      }];
      return sample.slice(0, n);
    }
    return [];
  }
  return rpc('search_playbooks_ft', { q, n });
}

