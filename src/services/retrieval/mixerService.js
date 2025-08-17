// src/services/retrieval/mixerService.js
// SQL-first mixer: pull playbooks + system knowledge, then vector augmentation.
// Returns { contextText, references, meta }.

import { supabase } from '../../config/supabase.js';
import { embedOne } from '../ai/openaiAdapter.js';
import { pineconeAdapter } from '../vector/pineconeAdapter.js';

function expandQuery(q) {
  const s = String(q || '').toLowerCase();
  const terms = [q];

  // VC20 / ZF / Glendinning / helm transfer aliases
  if (/\bvc[-\s]?20\b/.test(s) || /\bzf\b/.test(s) || /\bglendinning\b/.test(s)) {
    terms.push(
      'ZF station transfer',
      'helm transfer',
      'control head station select',
      'ZF VC20',
      'Glendinning control transfer',
      'dual station transfer',
      'upper lower helm transfer'
    );
  }
  // Generic wording that often appears in manuals
  if (s.includes('top') || s.includes('upper')) terms.push('flybridge station');
  if (s.includes('bottom') || s.includes('lower')) terms.push('lower helm');
  return Array.from(new Set(terms.filter(Boolean)));
}

function formatPlaybook(pb) {
  const title = pb?.title || 'Playbook';
  const summary = pb?.summary || pb?.safety || '';
  const steps = Array.isArray(pb?.steps) ? pb.steps : [];
  const lines = [`${title}`, summary ? summary : ''];

  for (let i = 0; i < Math.min(steps.length, 12); i++) {
    const step = steps[i];
    if (!step) continue;
    if (typeof step === 'string') {
      lines.push(`${i + 1}. ${step}`);
    } else if (step?.title || step?.text) {
      lines.push(`${i + 1}. ${[step.title, step.text].filter(Boolean).join(' — ')}`);
    }
  }
  return lines.filter(Boolean).join('\n');
}

function formatKnowledge(rows = []) {
  const out = [];
  for (const r of rows.slice(0, 8)) {
    if (r.title) out.push(`• ${r.title}`);
    if (r.content) out.push(r.content);
  }
  return out.join('\n');
}

export async function buildContextMix({ question, boatId = null, namespace, topK, requestId }) {
  const meta = {
    requestId,
    focus_system: null,
    playbook_hit: false,
    sql_rows: 0,
    sql_selected: 0,
    vec_default_matches: 0,
    vec_world_matches: 0,
    world_after_guard: 0,
    failures: []
  };

  const contextParts = [];
  const references = [];

  // -----------------------------
  // 1) SQL: standards_playbooks (two-pass: triggers then text)
  // -----------------------------
  try {
    // derive generic control/transfer keywords from the question (no product hard-coding)
    const q = String(question || '').toLowerCase();
    const baseHints = ['helm', 'station', 'transfer', 'select', 'control', 'upper', 'lower'];
    const dynamic = [];
    if (/\bupper\b/.test(q) || /\btop\b/.test(q)) dynamic.push('upper', 'flybridge');
    if (/\blower\b/.test(q) || /\bbottom\b/.test(q)) dynamic.push('lower');
    if (/\bwon.?t\b|\bwill not\b|\bcan.?t\b/.test(q)) dynamic.push('active', 'take');
    const hints = Array.from(new Set([...baseHints, ...dynamic]));

    let picked = [];

    // Pass A: triggers intersects (Postgres text[] is case-sensitive, try variants)
    if (supabase) {
      const tries = [
        hints,
        hints.map(h => h.toUpperCase()),
        hints.map(h => h[0]?.toUpperCase() + h.slice(1))
      ];
      for (const tlist of tries) {
        const { data, error } = await supabase
          .from('standards_playbooks')
          .select('id,title,summary,safety,steps,triggers,updated_at')
          .contains('triggers', tlist.slice(0, 3)) // keep array short
          .order('updated_at', { ascending: false })
          .limit(4);
        if (!error && Array.isArray(data) && data.length) {
          picked = data;
          break;
        }
      }
    }

    // Pass B: fallback text search (single OR across title/summary/safety)
    if ((!picked || picked.length === 0) && supabase) {
      const needles = hints.slice(0, 4);
      const ors = [];
      for (const t of needles) {
        ors.push(`title.ilike.%${t}%`, `summary.ilike.%${t}%`, `safety.ilike.%${t}%`);
      }
      const { data, error } = await supabase
        .from('standards_playbooks')
        .select('id,title,summary,safety,steps,triggers,updated_at')
        .or(ors.join(',')) // IMPORTANT: single .or with all clauses
        .order('updated_at', { ascending: false })
        .limit(4);
      if (!error && Array.isArray(data) && data.length) {
        picked = data;
      }
    }

    if (picked && picked.length) {
      meta.playbook_hit = true;
      for (const pb of picked.slice(0, 2)) {
        const txt = formatPlaybook(pb);
        if (txt) {
          contextParts.push(txt);
          references.push({ id: pb.id, source: 'standards_playbooks', score: 0.9 });
        }
      }
    }
  } catch (e) {
    meta.failures.push(`playbooks:${e.message}`);
  }


  // ----------------------------------------
  // 2) SQL: system_knowledge (boat-scoped)
  // ----------------------------------------
  try {
    if (supabase && boatId) {
      const expanded = expandQuery(question);
      const term = expanded[0] || question;

      let sk = supabase
        .from('system_knowledge')
        .select('id, title, content, knowledge_type, tags, updated_at')
        .eq('boat_id', boatId)
        .or(
          [
            `title.ilike.%${term}%`,
            `content.ilike.%${term}%`
          ].join(',')
        )
        .order('updated_at', { ascending: false })
        .limit(6);

      const { data: rows, error: skErr } = await sk;
      if (!skErr && Array.isArray(rows) && rows.length) {
        meta.sql_rows = rows.length;
        const text = formatKnowledge(rows);
        if (text) {
          contextParts.push(text);
          for (const r of rows.slice(0, 3)) {
            references.push({
              id: r.id,
              source: 'system_knowledge',
              score: 0.85
            });
          }
        }
        meta.sql_selected = Math.min(rows.length, 3);
      }
    }
  } catch (e) {
    meta.failures.push(`sys_knowledge:${e.message}`);
  }

  // -------------------------------------------------
  // 3) Vector augmentation (default + optional world)
  // -------------------------------------------------
  try {
    const expanded = expandQuery(question);
    const qJoin = expanded.join(' | '); // give embed some alias hints
    const vec = await embedOne(qJoin);
    const k = Number(process.env.RETRIEVAL_TOPK || topK || 8);

    // default namespace
    const matchesA = await pineconeAdapter.query({
      vector: vec,
      topK: k,
      namespace: process.env.PINECONE_NAMESPACE || undefined
    });
    meta.vec_default_matches = matchesA.length;
    for (const m of matchesA) {
      if (m?.text) {
        contextParts.push(m.text);
        references.push({ id: m.id, source: m.source || 'default', score: m.score });
      }
    }

    // world namespace (guardrailed)
    const worldNs = process.env.WORLD_NAMESPACE || 'world';
    const matchesB = await pineconeAdapter.query({
      vector: vec,
      topK: Math.max(4, Math.floor(k / 2)),
      namespace: worldNs
    });
    meta.vec_world_matches = matchesB.length;
    // pineconeAdapter already applies world guardrails; count what survived
    meta.world_after_guard = matchesB.length;
    for (const m of matchesB) {
      if (m?.text) {
        contextParts.push(m.text);
        references.push({ id: m.id, source: m.source || 'world', score: m.score });
      }
    }
  } catch (e) {
    meta.failures.push(`vector:${e.message}`);
  }

  // Final assembly
  const contextText = contextParts
    .filter(Boolean)
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n\n');

  return { contextText, references, meta };
}

export default { buildContextMix };
