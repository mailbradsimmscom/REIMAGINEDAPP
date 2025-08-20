// src/routes/debug-supabase.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/env.js';

const router = Router();

router.get('/debug/supabase', async (_req, res) => {
  try {
    const url = (ENV.SUPABASE_URL || '').trim();
    const key = (ENV.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!url || !key) {
      return res.json({
        ok: false,
        reason: 'missing_supabase_env',
        url_present: !!url,
        key_present: !!key
      });
    }

    // quick auth ping (no secrets leaked; we do not echo the key)
    const authResp = await fetch(`${url}/auth/v1/info`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const auth_ok = authResp.status !== 401;

    const sb = createClient(url, key, { auth: { persistSession: false } });

    // table head count (read-only)
    const tHead = await sb.from('assets_v2').select('*', { head: true, count: 'exact' });

    // RPCs (if present)
    const [rpcA, rpcP] = await Promise.all([
      sb.rpc('search_assets_ft', { q: 'gps', n: 1 }),
      sb.rpc('search_playbooks_ft', { q: 'gps', n: 1 })
    ]);

    return res.json({
      ok: auth_ok && !tHead.error,
      env: { url_present: true, key_present: true },
      auth: { status: authResp.status, ok: auth_ok },
      table_assets_v2: { count: tHead.count ?? null, error: tHead.error?.message ?? null },
      rpc_assets_ft: {
        ok: !rpcA.error,
        error: rpcA.error?.message ?? null,
        sample: Array.isArray(rpcA.data) ? rpcA.data[0] ?? null : null
      },
      rpc_playbooks_ft: {
        ok: !rpcP.error,
        error: rpcP.error?.message ?? null,
        sample: Array.isArray(rpcP.data) ? rpcP.data[0] ?? null : null
      }
    });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
});

export default router;
