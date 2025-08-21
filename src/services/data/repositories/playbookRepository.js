// src/services/data/repositories/playbookRepository.js
// Repository layer for playbook database operations

import { supabase } from '../../../config/supabase.js';
import { config } from '../../../config/index.js';
import { DatabaseError } from '../../../utils/errors.js';

/* --------------------- Utilities --------------------- */

const STOPWORDS = new Set([
  'the','and','for','you','your','yours','me','my','our','we','us',
  'a','an','of','in','on','to','from','by','with','as','at','is','are','was','were',
  'it','its','this','that','these','those','there','here',
  'about','tell','please','now','today','hey','hi','hello'
]);

function unique(arr) { 
  return Array.from(new Set((arr || []).filter(Boolean))); 
}

function normalize(s = '') {
  return String(s || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function lowerIncludes(text, keyword) {
  return String(text || '').toLowerCase().includes(keyword);
}

/**
 * Convert various array-like inputs to proper arrays
 * @param {*} value - Value to convert to array
 * @returns {Array} Normalized array
 */
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try { 
      const parsed = JSON.parse(value); 
      return Array.isArray(parsed) ? parsed : []; 
    } catch { 
      return value.split(/[\s,]+/).filter(Boolean);
    }
  }
  return [];
}

/**
 * Derive meaningful keywords from user question text
 * @param {string} question - User question
 * @returns {string[]} Array of filtered keywords
 */
export function derivePlaybookKeywords(question = '') {
  const tokens = String(question)
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
    .filter(word => word.length >= 3 && word.length <= 32 && !STOPWORDS.has(word));
  return unique(tokens).slice(0, 6);
}

/**
 * Format raw playbook row into standardized block object
 * @param {Object} row - Raw playbook database row
 * @returns {Object|null} Formatted playbook block or null if invalid
 */
export function formatPlaybookBlock(row) {
  if (!row) return null;

  // Handle steps field (can be JSON array or newline-separated string)
  let steps = [];
  if (Array.isArray(row.steps)) {
    steps = row.steps.filter(Boolean).map(normalize);
  } else if (typeof row.steps === 'string' && row.steps.trim()) {
    try {
      const parsed = JSON.parse(row.steps);
      if (Array.isArray(parsed)) {
        steps = parsed.filter(Boolean).map(normalize);
      }
    } catch {
      steps = row.steps.split(/\r?\n/).map(normalize).filter(Boolean);
    }
  }

  const block = {
    id: row.id,
    title: normalize(row.title || ''),
    summary: normalize(row.summary || ''),
    steps,
    safety: normalize(row.safety || ''),
    matchers: toArray(row.matchers),
    triggers: toArray(row.triggers),
    updatedAt: row.updated_at || null,
    source: 'standards_playbooks',
    score: row.score || null
  };

  // Return null if block has no meaningful content
  if (!block.title && !block.summary && steps.length === 0 && !block.safety) {
    return null;
  }
  
  return block;
}

/**
 * Calculate relevance score for a playbook based on keyword matches
 * @param {Object} playbook - Playbook record
 * @param {string[]} keywords - Search keywords
 * @returns {number} Relevance score
 */
function calculatePlaybookScore(playbook, keywords) {
  let score = 0;
  const title = String(playbook.title || '').toLowerCase();
  const summary = String(playbook.summary || '').toLowerCase();
  const matchers = Array.isArray(playbook.matchers) ? playbook.matchers : [];
  const triggers = Array.isArray(playbook.triggers) ? playbook.triggers : [];

  for (const keyword of keywords) {
    if (title.includes(keyword)) score += 3;
    if (summary.includes(keyword)) score += 1;
    if (matchers.some(m => lowerIncludes(m, keyword))) score += 4;
    if (triggers.some(t => lowerIncludes(t, keyword))) score += 3;
  }
  
  // Mild recency boost
  if (playbook.updated_at) score += 0.25;
  
  return score;
}

/**
 * Search playbooks using text search on title/summary
 * @param {string[]} keywords - Search keywords
 * @param {string} selectCols - Column selection string
 * @returns {Promise<Array>} Search results
 */
async function searchPlaybooksText(keywords, selectCols) {
  const ors = [];
  for (const keyword of keywords.slice(0, 4)) {
    const pattern = `%${keyword}%`;
    ors.push(`title.ilike.${pattern}`);
    ors.push(`summary.ilike.${pattern}`);
  }
  if (!ors.length) return [];
  
  try {
    const { data, error } = await supabase
      .from('standards_playbooks_compat')
      .select(selectCols)
      .or(ors.join(','))
      .limit(30);
    if (error) {
      throw new DatabaseError('Failed to search playbooks by text', 'select', 'standards_playbooks_compat', error);
    }
    if (Array.isArray(data)) return data;
  } catch (dbError) {
    if (dbError instanceof DatabaseError) throw dbError;
    // Fallback silently on other errors
  }
  return [];
}

/**
 * Search playbooks using array contains on matchers/triggers
 * @param {string[]} keywords - Search keywords
 * @param {string} selectCols - Column selection string
 * @returns {Promise<Array>} Search results
 */
async function searchPlaybooksArrays(keywords, selectCols) {
  const results = [];
  
  for (const keyword of keywords.slice(0, 4)) {
    // Search matchers array
    try {
      const { data, error } = await supabase
        .from('standards_playbooks_compat')
        .select(selectCols)
        .contains('matchers', [keyword])
        .limit(20);
      if (error) {
        throw new DatabaseError('Failed to search playbooks by matchers', 'select', 'standards_playbooks_compat', error);
      }
      if (Array.isArray(data)) results.push(...data);
    } catch (dbError) {
      if (dbError instanceof DatabaseError) throw dbError;
      // Continue on other errors
    }
    
    // Search triggers array
    try {
      const { data, error } = await supabase
        .from('standards_playbooks_compat')
        .select(selectCols)
        .contains('triggers', [keyword])
        .limit(20);
      if (error) {
        throw new DatabaseError('Failed to search playbooks by triggers', 'select', 'standards_playbooks_compat', error);
      }
      if (Array.isArray(data)) results.push(...data);
    } catch (dbError) {
      if (dbError instanceof DatabaseError) throw dbError;
      // Continue on other errors
    }
  }
  
  return results;
}

/**
 * Search playbooks using real keywords from the question
 * @param {string} question - User question
 * @param {Object} options - Search options
 * @param {number} [options.limit=5] - Maximum results to return
 * @returns {Promise<Array>} Scored and sorted playbook results
 */
export async function searchPlaybooks(question, { limit = 5 } = {}) {
  if (!supabase) return [];
  
  const keywords = derivePlaybookKeywords(question);
  if (!keywords.length) return []; // Prevents broad matches
  
  const selectCols = 'id,title,summary,steps,safety,matchers,triggers,updated_at';
  let allResults = [];
  
  // Combine text search and array search results
  const [textResults, arrayResults] = await Promise.all([
    searchPlaybooksText(keywords, selectCols),
    searchPlaybooksArrays(keywords, selectCols)
  ]);
  
  allResults = [...textResults, ...arrayResults];
  
  // Deduplicate by id
  const seen = new Set();
  const uniqueResults = allResults.filter(row => 
    row && row.id && !seen.has(row.id) && seen.add(row.id)
  );
  
  if (!uniqueResults.length) return [];
  
  // Score and sort results
  const scored = uniqueResults
    .map(row => ({ ...row, score: calculatePlaybookScore(row, keywords) }))
    .filter(row => row.score > 0) // Must match at least one keyword
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
  
  return scored;
}

/**
 * Search playbooks using Supabase RPC for full-text search
 * @param {string} query - FTS query string
 * @param {Object} options - Search options
 * @param {number} [options.limit=10] - Maximum results to return
 * @returns {Promise<Array>} Normalized playbook results with scores
 */
export async function searchPlaybooksRPC(query, { limit = 10 } = {}) {
  if (!config.RETRIEVAL_PLAYBOOK_ENABLED || !config.RETRIEVAL_FTS_ENABLED) return [];
  if (!supabase || !query) return [];
  
  try {
    const { data, error } = await supabase
      .rpc('search_playbooks_ft', { q: query, n: limit });
    if (error) {
      throw new DatabaseError('Failed to search playbooks using RPC', 'rpc', 'search_playbooks_ft', error);
    }
    if (!Array.isArray(data)) return [];

    const keywords = String(query).toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);

    return data.map((row) => {
      // Handle various casing differences in returned JSON
      const title = row.title ?? row.Title ?? row.data?.title ?? row.data?.Title ?? '';
      const summary = row.summary ?? row.Summary ?? row.data?.summary ?? row.data?.Summary ?? '';
      const modelKeys = toArray(row.model_keys ?? row.modelKeys ?? row.data?.model_keys ?? row.data?.modelKeys);
      const triggers = toArray(row.triggers ?? row.Triggers ?? row.data?.triggers ?? row.data?.Triggers);
      let score = Number(row.rank ?? row.score ?? 0);

      // Additional scoring based on keyword matches
      const titleLower = String(title).toLowerCase();
      const summaryLower = String(summary).toLowerCase();
      const modelKeysLower = modelKeys.map(m => String(m).toLowerCase());
      const triggersLower = triggers.map(t => String(t).toLowerCase());
      
      for (const keyword of keywords) {
        if (titleLower.includes(keyword)) score += 3;
        if (summaryLower.includes(keyword)) score += 1;
        if (modelKeysLower.some(m => m.includes(keyword))) score += 4;
        if (triggersLower.some(t => t.includes(keyword))) score += 3;
      }

      return {
        id: row.id ?? row.playbook_id ?? row.playbook_uid ?? null,
        title,
        summary,
        modelKeys,
        triggers,
        score,
        source: 'playbook',
        raw: row
      };
    }).filter(result => result.id);
  } catch (dbError) {
    if (dbError instanceof DatabaseError) throw dbError;
    return [];
  }
}

export default {
  searchPlaybooks,
  searchPlaybooksRPC,
  formatPlaybookBlock,
  derivePlaybookKeywords
};