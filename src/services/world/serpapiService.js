import 'dotenv/config';

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

export function buildWorldQueries(asset = {}, router = {}) {
  const { manufacturer = '', model = '', model_key = '' } = asset || {};
  const {
    keywords = [],
    allowDomains = [],
    intentKeywords = []
  } = router || {};

  const manufacturerTokens = tokenize(manufacturer);
  const modelTokens = tokenize(model);
  const modelKeyTokens = tokenize(model_key);

  const baseTokens = [...manufacturerTokens, ...modelTokens, ...modelKeyTokens];
  if (!baseTokens.length) {
    return { queries: [] };
  }

  const base = baseTokens.join(' ');
  const domainFilter = allowDomains
    .map(d => `site:${d}`)
    .join(' OR ');

  const queries = [];
  const baseTerms = [base, ...intentKeywords].filter(Boolean).join(' ');
  const baseQuery = domainFilter ? `${baseTerms} ${domainFilter}` : baseTerms;
  if (baseQuery.trim()) queries.push(baseQuery.trim());

  const extraKeywords = keywords || [];
  for (const kw of extraKeywords) {
    const terms = [base, kw, ...intentKeywords].filter(Boolean).join(' ');
    const q = domainFilter ? `${terms} ${domainFilter}` : terms;
    const trimmed = q.trim();
    if (trimmed && !queries.includes(trimmed)) queries.push(trimmed);
  }

  return { queries };
}

export async function serpapiSearch(queries = [], { engine = 'google', num = 10 } = {}) {
  if (!SERPAPI_KEY) throw new Error('Missing SERPAPI_API_KEY');
  const out = [];
  const seen = new Set();
  for (const query of queries) {
    if (!query) continue;
    const params = new URLSearchParams({
      engine,
      q: query,
      api_key: SERPAPI_KEY,
      num: String(num)
    });
    const url = `https://serpapi.com/search.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SerpAPI error: ${res.status} ${text}`);
    }
    const json = await res.json();
    const items = json.organic_results || [];
    for (const r of items) {
      const link = r.link || r.url;
      if (!link || seen.has(link)) continue;
      seen.add(link);
      out.push(r);
    }
  }
  return out;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function filterAndRank(results = [], asset = {}, router = {}, topK = 5) {
  const { manufacturer = '', model = '', model_key = '' } = asset || {};
  const {
    allowDomains = [],
    keywords = [],
    intentKeywords = []
  } = router || {};

  const tokens = [
    ...tokenize(manufacturer),
    ...tokenize(model),
    ...tokenize(model_key),
    ...keywords.map(k => String(k).toLowerCase()),
    ...intentKeywords.map(k => String(k).toLowerCase())
  ];

  const envAllow = String(process.env.WORLD_ALLOWLIST || '')
    .split(',')
    .map(d => d.toLowerCase())
    .filter(Boolean);
  const allow = (allowDomains.length ? allowDomains : envAllow)
    .map(d => String(d).toLowerCase());

  function hostname(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  const seen = new Set();
  const scored = [];
  for (const r of Array.isArray(results) ? results : []) {
    const link = r.link || r.url;
    if (!link || seen.has(link)) continue;
    seen.add(link);

    const host = hostname(link);
    if (allow.length && host && !allow.some(d => host === d || host.endsWith(`.${d}`))) {
      continue;
    }

    const text = `${r.title || ''} ${r.snippet || ''} ${link}`.toLowerCase();
    let score = 0;

    if (allow.length && host && allow.some(d => host === d || host.endsWith(`.${d}`))) {
      score += 5;
    }
    if (/\.pdf($|\?)/i.test(link)) score += 2;
    if (/\.docx?($|\?)/i.test(link)) score += 1;
    for (const t of tokens) {
      if (t && text.includes(t)) score += 1;
    }

    scored.push({
      title: r.title,
      link,
      snippet: r.snippet || r.snippet_highlighted || '',
      trust: score
    });
  }

  return scored
    .sort((a, b) => (b.trust || 0) - (a.trust || 0))
    .slice(0, topK);
}
