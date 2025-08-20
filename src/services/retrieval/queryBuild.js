// src/services/retrieval/queryBuild.js
const STOP = new Set(['the','a','an','and','or','of','to','for','my','about']);

export function tokensFromQuestion(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/.]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t));
}

export function orQuery(tokens) {
  const uniq = [...new Set(tokens)];
  return uniq.length ? uniq.join(' OR ') : '';
}
