// src/services/responder/references/referenceFilter.js
// Handles reference filtering and matching logic

/**
 * Keep only references that appear in the body text (match by human-readable fields)
 * @param {string} text - Text to search for reference matches
 * @param {Array} refs - Array of reference objects
 * @returns {Array} Filtered array of used references
 */
export function filterUsedReferences(text = '', refs = []) {
  const used = [];
  const body = String(text || '').toLowerCase();

  function extractKeys(r) {
    const keys = [];
    if (r?.title) keys.push(r.title);
    if (r?.model_key) keys.push(r.model_key);
    if (r?.manufacturer || r?.description) {
      keys.push([r.manufacturer, r.description].filter(Boolean).join(' '));
    }
    return keys.filter(Boolean).map(x => String(x).toLowerCase());
  }

  for (const ref of Array.isArray(refs) ? refs : []) {
    const keys = extractKeys(ref);
    if (!keys.length) continue;
    
    if (keys.some(token => token && body.includes(token))) {
      if (!used.some(u => u === ref)) used.push(ref);
    }
  }

  // If nothing matched, just return the first few
  return used.length ? used : (Array.isArray(refs) ? refs.slice(0, 6) : []);
}

export default { filterUsedReferences };