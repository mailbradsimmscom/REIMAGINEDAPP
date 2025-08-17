// src/config/supabase.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('❌ Supabase not configured: missing SUPABASE_URL or service/anon key');
}

export const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

export default supabase;
