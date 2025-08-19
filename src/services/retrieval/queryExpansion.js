// src/services/retrieval/queryExpansion.js

const STOPWORDS = new Set([
  'the','and','for','you','your','yours','me','my','our','we','us',
  'a','an','of','in','on','to','from','by','with','as','at','is','are','was','were',
  'it','its','this','that','these','those','there','here',
  'about','tell','please','now','today','hey','hi','hello'
]);

function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

export function expandTokens(userTokens = [], assetMatches = [], playbookMatches = []) {
  const out = new Set();

  function add(token) {
    const t = String(token || '').toLowerCase();
    if (!t || STOPWORDS.has(t)) return;
    out.add(t);
  }

  function addText(text) {
    for (const t of tokenize(text)) add(t);
  }

  function addField(val) {
    if (Array.isArray(val)) {
      for (const v of val) addText(v);
    } else {
      addText(val);
    }
  }

  for (const t of Array.isArray(userTokens) ? userTokens : []) add(t);

  for (const a of Array.isArray(assetMatches) ? assetMatches : []) {
    addText(a?.model_key);
    addText(a?.model);
    addText(a?.manufacturer);
    addField(a?.enrich_spec_keywords);
  }

  for (const pb of Array.isArray(playbookMatches) ? playbookMatches : []) {
    addField(pb?.triggers);
    addField(pb?.matchers);
  }

  return Array.from(out);
}

export default { expandTokens };

