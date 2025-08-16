// src/routes/admin.js
import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

/**
 * Count rows in a table using a HEAD request (fast & cheap).
 * Returns { count } or { error }.
 */
async function countTable(table) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) return { error: error.message };
    return { count: typeof count === 'number' ? count : 0 };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Lightweight connectivity probe: try reading a single row
 * from a small table (app_settings), falling back to a metadata call.
 */
async function healthProbe() {
  if (!supabase) return { ok: false, error: 'Supabase client not initialized' };

  try {
    const { error } = await supabase.from('app_settings').select('key').limit(1);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    // Fallback probe: query another lightweight table if app_settings is empty/missing
    try {
      const { error: e2 } = await supabase.from('boats').select('id').limit(1);
      if (e2) throw e2;
      return { ok: true, note: 'Probed boats table' };
    } catch (e3) {
      return { ok: false, error: e3.message };
    }
  }
}

router.get('/supabase', async (_req, res) => {
  try {
    const health = await healthProbe();

    // Build a summary across key tables you stood up in Supabase
    const tables = [
      'answers_cache',
      'app_settings',
      'boat_conversations',
      'boat_profile',
      'boat_specs',
      'boat_systems',
      'boats',
      'qa_feedback',
      'standards_playbooks',
      'system_knowledge',
      'world_cache',
    ];

    const summaryEntries = await Promise.all(
      tables.map(async (t) => [t, await countTable(t)])
    );

    const summary = Object.fromEntries(summaryEntries);

    res.json({
      ok: !!health.ok,
      health,
      summary,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
      time: new Date().toISOString(),
    });
  }
});

export default router;
