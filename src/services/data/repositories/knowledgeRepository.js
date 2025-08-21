// src/services/data/repositories/knowledgeRepository.js
// Repository layer for knowledge and system database operations

import { supabase } from '../../../config/supabase.js';

/* --------------------- Utilities --------------------- */

const normalize = (s) => String(s || '').toLowerCase();
const hasText = (haystack, needle) => normalize(haystack).includes(normalize(needle));

/**
 * Get all boat systems from the database
 * Single boat setup, so no boat_id filter needed
 * @returns {Promise<Object>} { rows: Array, error: string|null }
 */
export async function getBoatSystems() {
  if (!supabase) {
    return { rows: [], error: 'no_supabase' };
  }
  
  try {
    const { data, error } = await supabase
      .from('boat_systems_compat')
      .select('id, category, brand, model, serial_number, installation_date, specifications, updated_at')
      .order('updated_at', { ascending: false });

    return { 
      rows: data || [], 
      error: error?.message || null 
    };
  } catch (err) {
    return { 
      rows: [], 
      error: err.message || 'Unknown error fetching boat systems' 
    };
  }
}

/**
 * Calculate relevance score for a system based on question content
 * @param {Object} system - System record
 * @param {string} question - User question (normalized)
 * @returns {number} Relevance score
 */
function calculateSystemScore(system, question) {
  let score = 0;
  
  if (system.category && hasText(question, system.category)) score += 3;
  if (system.brand && hasText(question, system.brand)) score += 2;
  if (system.model && hasText(question, system.model)) score += 2;
  
  // Boost for maintenance-related questions
  if (/maintain|service|filter|schedule|troubleshoot|replace|clean/i.test(question)) {
    score += 1;
  }
  
  return score;
}

/**
 * Find the most relevant system for a given question
 * @param {string} question - User question
 * @param {Array} systems - Available systems
 * @returns {Object|null} Most relevant system or null if none match
 */
export function findFocusSystem(question, systems = []) {
  const questionNorm = normalize(question);
  if (!questionNorm || !systems.length) return null;

  const scored = systems
    .map((system) => ({
      score: calculateSystemScore(system, questionNorm),
      system
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score === 0) return null;

  const focusSystem = top.system;
  return {
    id: focusSystem.id,
    category: focusSystem.category || null,
    brand: focusSystem.brand || null,
    model: focusSystem.model || null,
    serial_number: focusSystem.serial_number || null,
    installation_date: focusSystem.installation_date || null,
  };
}

/**
 * Score a playbook for relevance to question and focus system
 * @param {Object} playbook - Playbook record
 * @param {string} question - User question (normalized)
 * @param {string[]} systemWords - Words from focus system
 * @returns {number} Relevance score
 */
function scorePlaybook(playbook, question, systemWords) {
  let score = 0;
  
  // System-related matches
  if (playbook.archetype_key && systemWords.some(w => hasText(playbook.archetype_key, w))) {
    score += 3;
  }
  if (playbook.title && systemWords.some(w => hasText(playbook.title, w))) {
    score += 2;
  }
  
  // Trigger matches
  const triggers = Array.isArray(playbook.triggers) ? playbook.triggers : [];
  if (triggers.some(t => hasText(question, t))) {
    score += 2;
  }
  
  // Matcher matches
  const matchers = playbook.matchers && typeof playbook.matchers === 'object' 
    ? playbook.matchers 
    : {};
  const textMatchers = Object.values(matchers).flat().map(String);
  if (textMatchers.some(m => hasText(question, m))) {
    score += 2;
  }
  
  // Summary matches for system category
  if (playbook.summary && hasText(playbook.summary, systemWords[0] || '')) {
    score += 1;
  }
  
  return score;
}

/**
 * Fetch playbook snippets relevant to a system and question
 * @param {Object} params - Search parameters
 * @param {string} params.question - User question
 * @param {Object} params.focusSystem - Focus system object
 * @param {number} [params.linesMax=4] - Maximum lines to return
 * @returns {Promise<Object>} { lines: Array, refs: Array, meta: Object }
 */
export async function getPlaybookSnippets({ question, focusSystem, linesMax = 4 }) {
  if (!supabase) {
    return { 
      lines: [], 
      refs: [], 
      meta: { sql_offline: true } 
    };
  }

  try {
    const { data, error } = await supabase
      .from('standards_playbooks_compat')
      .select('id, archetype_key, title, summary, triggers, steps, matchers, ref_urls, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      return { 
        lines: [], 
        refs: [], 
        meta: { error: error.message } 
      };
    }

    const questionNorm = normalize(question);
    const systemWords = [
      focusSystem?.category,
      focusSystem?.brand,
      focusSystem?.model
    ].filter(Boolean).map(normalize);

    // Score and sort playbooks by relevance
    const scored = (data || [])
      .map(playbook => ({
        score: scorePlaybook(playbook, questionNorm, systemWords),
        playbook
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const lines = [];
    const refs = [];

    // Extract relevant content up to linesMax
    for (const { playbook } of scored) {
      if (lines.length >= linesMax) break;

      // Add summary if available
      if (playbook.summary) {
        const summary = playbook.summary.trim();
        if (summary) {
          lines.push(summary);
          refs.push({ 
            origin: 'playbook', 
            id: playbook.id, 
            source: 'standards_playbooks_compat', 
            text: summary, 
            score: 1.0 
          });
        }
      }

      // Add steps if available
      const steps = Array.isArray(playbook.steps) ? playbook.steps : [];
      for (const step of steps) {
        if (lines.length >= linesMax) break;
        
        const text = typeof step === 'string'
          ? step
          : (step?.text || step?.description || step?.summary || '');
        
        if (text && text.trim()) {
          const trimmedText = text.trim();
          lines.push(trimmedText);
          refs.push({ 
            origin: 'playbook', 
            id: playbook.id, 
            source: 'standards_playbooks_compat', 
            text: trimmedText, 
            score: 0.9 
          });
        }
      }
    }

    return { 
      lines, 
      refs, 
      meta: { 
        playbook_hit: lines.length > 0, 
        playbooks_considered: scored.length 
      } 
    };
  } catch (err) {
    return { 
      lines: [], 
      refs: [], 
      meta: { error: err.message || 'Unknown error fetching playbooks' } 
    };
  }
}

/**
 * Score a knowledge record for relevance
 * @param {Object} record - Knowledge record
 * @param {string} question - User question (normalized)
 * @param {Object} focusSystem - Focus system object
 * @returns {number} Relevance score
 */
function scoreKnowledgeRecord(record, question, focusSystem) {
  let score = 0;
  
  // Knowledge type matches
  if (record.knowledge_type && /maintain|maintenance|service|filter|replace|schedule/.test(normalize(record.knowledge_type))) {
    score += 2;
  }
  
  // Title matches
  if (record.title && hasText(question, record.title)) {
    score += 1;
  }
  
  // Content matches system category
  if (record.content && hasText(record.content, focusSystem?.category || '')) {
    score += 1;
  }
  
  return score;
}

/**
 * Fetch system knowledge snippets from the database
 * @param {Object} params - Search parameters
 * @param {Object} params.focusSystem - Focus system object
 * @param {string} params.question - User question
 * @param {number} [params.linesMax=6] - Maximum lines to return
 * @returns {Promise<Object>} { lines: Array, refs: Array, meta: Object }
 */
export async function getSystemKnowledgeSnippets({ focusSystem, question, linesMax = 6 }) {
  if (!supabase) {
    return { 
      lines: [], 
      refs: [], 
      meta: { sql_offline: !supabase } 
    };
  }

  try {
    let query = supabase
      .from('system_knowledge')
      .select('id, system_id, knowledge_type, title, content, source, updated_at')
      .order('updated_at', { ascending: false });

    // Filter by system if focus system is specified
    if (focusSystem?.id) {
      query = query.eq('system_id', focusSystem.id);
    }

    const { data, error } = await query;
    
    if (error) {
      return { 
        lines: [], 
        refs: [], 
        meta: { error: error.message } 
      };
    }

    const rows = data || [];
    const questionNorm = normalize(question);

    // Score and sort knowledge records
    const rowsScored = rows
      .map(record => ({
        score: scoreKnowledgeRecord(record, questionNorm, focusSystem),
        record
      }))
      .sort((a, b) => b.score - a.score);

    const lines = [];
    const refs = [];

    // Extract relevant content up to linesMax
    for (const { record } of rowsScored) {
      if (lines.length >= linesMax) break;
      
      const header = record.title ? record.title.trim() : null;
      
      // Extract first 2 lines of content as snippet
      const snippet = String(record.content || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');

      const payload = (header ? `${header}: ` : '') + snippet;

      if (payload.trim()) {
        const trimmedPayload = payload.trim();
        lines.push(trimmedPayload);
        refs.push({
          origin: 'boat_sql',
          id: record.id,
          source: record.source || 'system_knowledge',
          text: trimmedPayload,
          score: 0.85
        });
      }
    }

    return { 
      lines, 
      refs, 
      meta: { 
        sql_rows: rows.length, 
        sql_selected: lines.length 
      } 
    };
  } catch (err) {
    return { 
      lines: [], 
      refs: [], 
      meta: { error: err.message || 'Unknown error fetching system knowledge' } 
    };
  }
}

/**
 * Generate a single-line header for the focus system
 * @param {Object} focusSystem - Focus system object
 * @returns {string|null} System header string or null if no system
 */
export function makeSystemHeader(focusSystem) {
  if (!focusSystem) return null;
  
  const parts = [];
  if (focusSystem.category) parts.push(focusSystem.category);
  
  const detail = [focusSystem.brand, focusSystem.model].filter(Boolean).join(' ');
  if (detail) parts.push(detail);
  
  const label = parts.join(' — ');
  return label ? `System: ${label}` : null;
}

export default {
  getBoatSystems,
  findFocusSystem,
  getPlaybookSnippets,
  getSystemKnowledgeSnippets,
  makeSystemHeader
};