import { createClient } from '@supabase/supabase-js';

function createSb() {
  const url = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Map to your existing tables (override via .env if needed)
const TBL_KNOWLEDGE = process.env.SUPABASE_TABLE_KNOWLEDGE || 'system_knowledge';
const TBL_QA_FEEDBACK = process.env.SUPABASE_TABLE_QA_FEEDBACK || 'qa_feedback';

/**
 * Health: simple select to confirm connectivity and table presence
 */
async function health() {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'Missing SUPABASE_URL or key' };
  try {
    const { error } = await sb.from(TBL_KNOWLEDGE).select('id', { count: 'exact', head: true, limit: 1 });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * List "documents" from system_knowledge
 * Output shape: { id, title, topic, source, updated_at }
 */
async function listDocuments({ limit = 50, offset = 0 } = {}) {
  const sb = createSb();
  if (!sb) return { ok: false, items: [], error: 'No Supabase client' };
  try {
    const { data, error } = await sb
      .from(TBL_KNOWLEDGE)
      .select('id,title,knowledge_type,source,updated_at')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { ok: false, items: [], error: error.message };
    const items = (data || []).map(row => ({
      id: row.id,
      title: row.title,
      topic: row.knowledge_type || 'untagged',
      source: row.source || null,
      updated_at: row.updated_at || null
    }));
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

/**
 * Aggregate topics from system_knowledge. Topic = knowledge_type
 */
async function listTopics() {
  const sb = createSb();
  if (!sb) return { ok: false, items: [], error: 'No Supabase client' };
  try {
    // Return all rows of knowledge_type and aggregate in app (portable across Postgrest versions)
    const { data, error } = await sb
      .from(TBL_KNOWLEDGE)
      .select('knowledge_type');
    if (error) return { ok: false, items: [], error: error.message };

    const counts = new Map();
    for (const row of data || []) {
      const t = row.knowledge_type || 'untagged';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    const items = Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

/**
 * Save feedback into qa_feedback
 * Maps our body -> qa_feedback schema
 *   question: string
 *   answer_id: string | null (from meta.answer_id)
 *   thumb: 'up' | 'down' | null  (derive from rating)
 *   reason: text (from message)
 *   intent: text (from meta.intent)
 *   entities: jsonb (from meta.entities)
 *   evidence_ids: jsonb (from meta.evidence_ids)
 */
function ratingToThumb(rating) {
  if (typeof rating !== 'number') return null;
  if (rating >= 4) return 'up';
  if (rating <= 2) return 'down';
  return null;
}

async function saveFeedback(body = {}) {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'No Supabase client' };
  const meta = body.meta || {};
  const record = {
    question: body.question ?? null,
    answer_id: meta.answer_id ?? null,
    thumb: body.thumb ?? ratingToThumb(body.rating),
    reason: body.message ?? null,
    intent: meta.intent ?? null,
    entities: meta.entities ?? null,
    evidence_ids: meta.evidence_ids ?? null,
    // created_at: db default handles timestamp
  };
  try {
    const { data, error } = await sb.from(TBL_QA_FEEDBACK).insert(record).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, item: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Admin summary: quick counts of key tables
 */
async function adminSummary() {
  const sb = createSb();
  if (!sb) return { ok: false, error: 'No Supabase client' };
  try {
    const counts = {};
    for (const [tbl, key] of [
      [TBL_KNOWLEDGE, 'system_knowledge'],
      [TBL_QA_FEEDBACK, 'qa_feedback'],
      ['boat_profile', 'boat_profile'],
      ['boat_systems', 'boat_systems'],
      ['boat_conversations', 'boat_conversations'],
      ['answers_cache', 'answers_cache'],
      ['standards_playbooks', 'standards_playbooks'],
      ['world_cache', 'world_cache']
    ]) {
      const { count, error } = await sb.from(tbl).select('*', { count: 'exact', head: true });
      counts[key] = error ? null : count;
    }
    return { ok: true, counts };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const supabaseAdapter = {
  health,
  listDocuments,
  listTopics,
  saveFeedback,
  adminSummary
};

export default { supabaseAdapter };
