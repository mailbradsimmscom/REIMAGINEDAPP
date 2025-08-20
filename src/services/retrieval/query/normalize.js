// src/services/retrieval/query/normalize.js
// Utility functions to normalize search questions for retrieval.

// Basic English stop words to filter out filler terms from questions.
// The list is intentionally small and purpose-driven; expand as needed.
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for',
  'my', 'about', 'is', 'are', 'was', 'were', 'be', 'being', 'been',
  'i', 'me', 'we', 'us', 'our', 'you', 'your',
  'can', 'could', 'would', 'should', 'do', 'does', 'did',
  'tell', 'show', 'give', 'please', 'what', 'when', 'where', 'why', 'how'
]);

/**
 * Breaks a question into normalized tokens with stop-word removal.
 * @param {string} q - The question or phrase to tokenize.
 * @returns {string[]} Array of lowercase tokens without stop words.
 */
export function tokensFromQuestion(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/.]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t));
}

/**
 * Builds a unique OR clause from tokens for use in FTS queries.
 * @param {string[]} tokens - Tokenized words.
 * @returns {string} OR clause string, e.g. "gps OR gnss".
 */
export function orQuery(tokens) {
  const uniq = [...new Set(tokens)];
  return uniq.length ? uniq.join(' OR ') : '';
}
