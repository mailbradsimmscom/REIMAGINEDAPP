// src/services/sql/augmentService.js
// Centralized SQL-first augmentation: resolve focus system, playbooks, and boat knowledge.
// Returns normalized lines + references + meta (no vector calls here).

import {
  getBoatSystems,
  findFocusSystem,
  getPlaybookSnippets,
  getSystemKnowledgeSnippets,
  makeSystemHeader
} from './knowledgeService.js';

const envNum = (k, def) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

// Per-source caps (you can tune via env without touching code)
const PLAYBOOKS_LINES_MAX = envNum('PLAYBOOKS_LINES_MAX', 4);
const SYSTEM_KNOWLEDGE_LINES_MAX = envNum('SYSTEM_KNOWLEDGE_LINES_MAX', 6);
const CONTEXT_LINES_MAX = envNum('CONTEXT_LINES_MAX', 12);

export async function augmentWithSQL({ question, boatId }) {
  const meta = {
    focus_system: null,
    sql_rows: 0,
    sql_selected: 0,
    playbook_hit: false,
    failures: []
  };

  const lines = [];
  const refs = [];

  // 1) Resolve systems and focus
  let systems = [];
  if (boatId) {
    const { rows, error } = await getBoatSystems(boatId);
    if (error) meta.failures.push('sql_boat_systems:' + error);
    systems = rows || [];
  }
  const focus = findFocusSystem(question, systems);
  if (focus) meta.focus_system = focus;

  // Optional header (1 line)
  const header = makeSystemHeader(focus);
  if (header) {
    lines.push(header);
    refs.push({
      origin: 'boat_sql',
      id: focus?.id || 'focus',
      source: 'boat_systems',
      text: header,
      score: 1.0
    });
  }

  // Stop early if we’re at/over the global cap
  const atCap = () => lines.length >= CONTEXT_LINES_MAX;

  // 2) Playbooks
  try {
    if (!atCap()) {
      const { lines: pLines, refs: pRefs, meta: m } = await getPlaybookSnippets({
        question,
        focusSystem: focus,
        linesMax: PLAYBOOKS_LINES_MAX
      });
      meta.playbook_hit = !!m.playbook_hit;
      for (let i = 0; i < pLines.length && !atCap(); i++) {
        lines.push(pLines[i]);
        refs.push(pRefs[i]);
      }
    }
  } catch (e) {
    meta.failures.push('playbook:' + e.message);
  }

  // 3) Boat system knowledge
  try {
    if (!atCap()) {
      const { lines: sLines, refs: sRefs, meta: m } = await getSystemKnowledgeSnippets({
        boatId,
        focusSystem: focus,
        question,
        linesMax: SYSTEM_KNOWLEDGE_LINES_MAX
      });
      meta.sql_rows = (meta.sql_rows || 0) + (m.sql_rows || 0);
      meta.sql_selected = (meta.sql_selected || 0) + sLines.length;
      for (let i = 0; i < sLines.length && !atCap(); i++) {
        lines.push(sLines[i]);
        refs.push(sRefs[i]);
      }
    }
  } catch (e) {
    meta.failures.push('boat_sql:' + e.message);
  }

  return {
    lines,
    refs,
    meta
  };
}

