// src/services/retrieval/mixerService.js
import supabase from '../../config/supabase.js';
import ai from '../ai/aiService.js';
import pinecone from '../vector/pineconeAdapter.js';

/**
 * Light PDF/OCR sanitizer to keep context readable and focused.
 */
function cleanChunk(t = '') {
  return String(t)
    // common PDF artifacts
    .replace(/\b(\d{1,3})\s*\|\s*Pa\s*ge\b/gi, '')  // "37 | Pa ge"
    .replace(/·/g, '•')                              // normalize bullets
    .replace(/-\s*\n\s*/g, '')                       // de-hyphenate across line breaks
    .replace(/\u00A0/g, ' ')                         // nbsp → space
    .replace(/\s{2,}/g, ' ')                         // collapse spaces
    .replace(/[^\S\r\n]+$/gm, '')                    // trim line-end spaces
    .replace(/\n(?!\n)/g, ' ')                       // single newlines → spaces
    .trim();
}

/**
 * Build a small set of topic hints from the question — generic, no product hard-coding.
 */
function deriveHints(question) {
  const q = String(question || '').toLowerCase();
  const base = ['helm', 'station', 'transfer', 'select', 'control', 'upper', 'lower'];
  const dyn = [];
  if (/\bupper\b|\btop\b/.test(q)) dyn.push('upper', 'flybridge');
  if (/\blower\b|\bbottom\b/.test(q)) dyn.push('lower');
  if (/\bwon.?t\b|\bwill not\b|\bcan.?t\b/.test(q)) dyn.push('active', 'take');
  return Array.from(new Set([...base, ...dyn]));
}

function onTopic(hints, text) {
  const s = String(text || '').toLowerCase();
  return hints.some(h => s.includes(h));
}

/**
 * Format a playbook row (from standards_playbooks) into concise context text.
 */
function formatPlaybook(pb) {
  if (!pb) return '';
  const title = pb.title ? `**${pb.title.trim()}**` : '';
  const summary = pb.summary ? pb.summary.trim() : '';
  const safety  = pb.safety ? pb.safety.trim() : '';
  let steps = '';

  // steps may be structured or plain text — handle both
  if (Array.isArray(pb.steps) && pb.steps.length) {
    steps = pb.steps
      .map((s, i) => `${i + 1}. ${typeof s === 'string' ? s : (s?.text || '')}`.trim())
      .filter(Boolean)
      .join('\n');
  } else if (typeof pb.steps === 'string' && pb.steps.trim()) {
    steps = pb.steps
      .split(/\n+/)
      .map((line, i) => `${i + 1}. ${line.trim()}`)
      .join('\n');
  }

  const parts = [];
  if (title) parts.push(title);
  if (summary) parts.push(summary);
  if (steps) parts.push(steps);
  if (safety) parts.push(`**⚠️ Safety**\n• ${safety.replace(/^\s*[-*•]\s*/gm, '').replace(/\n+/g, '\n• ')}`);

  return cleanChunk(parts.filter(Boolean).join('\n\n'));
}

/**
 * Query standards_playbooks with triggers first (contains on text[])
 * then fallback to OR ilike across title/summary/safety.
 */
async function fetchPlaybooks(question, limit = 4) {
  const results = [];
  if (!supabase) return results;

  const hints = deriveHints(question);
  // Pass A: triggers (try case variants for text[] contains)
  const tries = [
    hints,
    hints.map(h => h.toUpperCase()),
    hints.map(h => h[0]?.toUpperCase() + h.slice(1)),
  ];

  for (const tlist of tries) {
    const { data, error } = await supabase
      .from('standards_playbooks')
      .select('id,title,summary,safety,steps,triggers,updated_at')
      .contains('triggers', tlist.slice(0, 3))
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length) {
      results.push(...data);
      break;
    }
  }

  // Pass B: fallback OR ilike, if none found
  if (results.length === 0) {
    const needles = hints.slice(0, 4);
    const ors = [];
    for (const t of needles) {
      ors.push(`title.ilike.%${t}%`, `summary.ilike.%${t}%`, `safety.ilike.%${t}%`);
    }
    const { data, error } = await supabase
      .from('standards_playbooks')
      .select('id,title,summary,safety,steps,triggers,updated_at')
      .or(ors.join(','))
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length) {
      results.push(...data);
    }
  }

  return results;
}

/**
 * Fetch boat-specific system knowledge (narrow by boat_id).
 */
async function fetchBoatKnowledge(boatId, limit = 4) {
  if (!supabase || !boatId) return [];
  const { data, error } = await supabase
    .from('system_knowledge')
    .select('id,title,content,source,knowledge_type,updated_at')
    .eq('boat_id', boatId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data;
}

/**
 * Vector search with guardrails:
 *  - use embedding from ai service if available
 *  - query default namespace and optionally 'world'
 *  - topic filter + sanitized text
 */
async function vectorRetrieve(question, { topK = 8, namespace, hints }) {
  const out = { defaultMatches: [], worldMatches: [] };
  if (!ai || !pinecone) return out;

  let vector = null;
  try {
    vector = await ai.embed(question);
  } catch (_) {
    // no embedding available; skip
  }
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    return out;
  }

  const k = Math.max(3, Math.min(Number(process.env.RETRIEVAL_TOPK) || topK, 20));

  // default / __default__ namespace
  try {
    const defMatches = await pinecone.query({
      vector,
      topK: k,
      namespace: namespace || undefined,
    });
    out.defaultMatches = Array.isArray(defMatches) ? defMatches : [];
  } catch (_) {
    out.defaultMatches = [];
  }

  // optional world namespace
  const worldNs = process.env.WORLD_NAMESPACE || 'world';
  try {
    const wMatches = await pinecone.query({
      vector,
      topK: Math.min(k, 5),
      namespace: worldNs,
    });
    out.worldMatches = Array.isArray(wMatches) ? wMatches : [];
  } catch (_) {
    out.worldMatches = [];
  }

  // post-filter default matches by topic; world is already heavily guarded elsewhere
  const topical = (out.defaultMatches || [])
    .filter(m => m && m.text)
    .filter(m => onTopic(hints, m.text));

  topical.sort((a, b) => (b.score || 0) - (a.score || 0));
  out.defaultMatches = topical.slice(0, Math.min(5, k));

  // sanitize
  out.defaultMatches = out.defaultMatches.map(m => ({ ...m, text: cleanChunk(m.text) }));
  out.worldMatches   = out.worldMatches.map(m => ({ ...m, text: cleanChunk(m.text) }));

  return out;
}

/**
 * Main mixer: SQL-first (playbooks → boat knowledge) then vector.
 */
export async function buildContextMix({ question, boatId = null, namespace, topK = 8, requestId }) {
  const meta = {
    requestId,
    focus_system: null,
    playbook_hit: false,
    sql_rows: 0,
    sql_selected: 0,
    vec_default_matches: 0,
    vec_world_matches: 0,
    world_after_guard: 0,
    failures: [],
  };

  const contextParts = [];
  const references = [];
  const hints = deriveHints(question);

  // 1) Playbooks (strong, structured, on-topic)
  try {
    const pbs = await fetchPlaybooks(question, 4);
    if (pbs.length > 0) {
      meta.playbook_hit = true;
      meta.sql_rows += pbs.length;

      // Keep top 2 to avoid drowning the rest
      for (const pb of pbs.slice(0, 2)) {
        const txt = formatPlaybook(pb);
        if (txt) {
          contextParts.push(txt);
          references.push({ id: pb.id, source: 'standards_playbooks', score: 0.95 });
          meta.sql_selected += 1;
        }
      }
    }
  } catch (e) {
    meta.failures.push(`playbooks:${e.message}`);
  }

  // 2) Boat-specific SQL knowledge (light sprinkle)
  try {
    const boatRows = await fetchBoatKnowledge(boatId, 4);
    meta.sql_rows += boatRows.length;
    for (const row of boatRows.slice(0, 2)) {
      const head = row.title ? `**${row.title.trim()}**` : '';
      const body = cleanChunk(row.content || '');
      const block = [head, body].filter(Boolean).join('\n\n');
      if (block) {
        contextParts.push(block);
        references.push({ id: row.id, source: 'system_knowledge', score: 0.85 });
        meta.sql_selected += 1;
      }
    }
  } catch (e) {
    meta.failures.push(`boat_sql:${e.message}`);
  }

  // 3) Vector augmentation (topical & trimmed)
  try {
    const { defaultMatches, worldMatches } = await vectorRetrieve(question, { topK, namespace, hints });
    meta.vec_default_matches = defaultMatches.length;
    meta.vec_world_matches   = worldMatches.length;

    // keep at most 3 default + 1 world to avoid drowning SQL content
    for (const m of defaultMatches.slice(0, 3)) {
      if (m?.text) {
        contextParts.push(m.text);
        references.push({ id: m.id, source: m.source || 'default', score: m.score });
      }
    }
    for (const m of worldMatches.slice(0, 1)) {
      if (m?.text) {
        contextParts.push(m.text);
        references.push({ id: m.id, source: m.source || 'world', score: m.score });
      }
    }
  } catch (e) {
    meta.failures.push(`vector:${e.message}`);
  }

  // Final context (sanitized once more)
  const contextText = cleanChunk(contextParts.join('\n\n'));

  return {
    contextText,
    references,
    meta,
  };
}

export default { buildContextMix };
