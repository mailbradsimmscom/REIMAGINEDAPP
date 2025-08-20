    // src/lib/supabase.js
    import { createClient } from '@supabase/supabase-js';
    import { ENV } from '../config/env.js';

    let client = null;

    if (ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY) {
      client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: { headers: { 'X-Client-Info': 'app/fts-rpc' } }
      });
    } else {
      // Optional: keep this quiet in prod if you prefer
      console.warn('[supabase] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; RPC disabled.');
    }

    export const sb = client;
