import 'dotenv/config';

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

export function buildWorldQueries(asset = {}, router = {}) {
  const { brand = '', model = '', spec = '' } = asset || {};
  const { keywords = [], allowDomains = [] } = router || {};

  const brandTokens = tokenize(brand);
  const modelTokens = tokenize(model);
  const specTokens = tokenize(spec);

  const baseTokens = [...brandTokens, ...modelTokens, ...specTokens];
  if (!baseTokens.length) {
    return { queries: [] };
  }

  const base = baseTokens.join(' ');
  const domainFilter = allowDomains
    .map(d => `site:${d}`)
    .join(' OR ');

  const queries = [];
  const baseQuery = domainFilter ? `${base} ${domainFilter}` : base;
  queries.push(baseQuery.trim());

  for (const kw of keywords) {
    const q = domainFilter
      ? `${base} ${kw} ${domainFilter}`
      : `${base} ${kw}`;
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
  const { brand = '', model = '', spec = '' } = asset || {};
  const { allowDomains = [], keywords = [] } = router || {};

  const tokens = [
    ...tokenize(brand),
    ...tokenize(model),
    ...tokenize(spec),
    ...keywords.map(k => String(k).toLowerCase())
  ];

  const allow = allowDomains.map(d => String(d).toLowerCase());

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
      score
    });
  }

  return scored
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK)
    .map(({ score, ...rest }) => rest);
}
