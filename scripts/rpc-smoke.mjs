// scripts/rpc-smoke.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase creds'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession:false } });

const q = 'gps';
const n = 5;

const { data: aData, error: aErr } =
  await sb.rpc('search_assets_ft', { q, n });
const { data: pData, error: pErr } =
  await sb.rpc('search_playbooks_ft', { q, n });

if (aErr) console.error('assets RPC error:', aErr.message);
if (pErr) console.error('playbooks RPC error:', pErr.message);

console.log(JSON.stringify({
  assets_count: Array.isArray(aData) ? aData.length : 0,
  playbooks_count: Array.isArray(pData) ? pData.length : 0,
  sample_asset: aData?.[0],
  sample_playbook: pData?.[0]
}, null, 2));
