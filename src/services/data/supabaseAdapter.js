const { createClient } = require('@supabase/supabase-js');

function createSb() {
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional for now
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { persistSession: false } });
}

async function upsertInteraction({ question, answer, meta }) {
  const sb = createSb();
  if (!sb) return { id: 'mock-log' };

  const { data, error } = await sb.from('interactions').insert({
    question,
    answer,
    meta,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) throw error;
  return data;
}

module.exports = { supabaseAdapter: { upsertInteraction } };
