import 'dotenv/config';

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

export function buildWorldQueries(topic) {
  if (!topic || typeof topic !== 'string') return [];
  const base = topic.trim();
  if (!base) return [];
  return [
    base,
    `${base} latest news`,
    `${base} current events`
  ];
}

export async function serpapiSearch(query, { engine = 'google', num = 10 } = {}) {
  if (!SERPAPI_KEY) throw new Error('Missing SERPAPI_API_KEY');
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
  return json.organic_results || [];
}

export function filterAndRank(results = []) {
  const seen = new Set();
  return results
    .filter(r => {
      const link = r.link || r.url;
      if (!link || seen.has(link)) return false;
      seen.add(link);
      return true;
    })
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map(r => ({
      title: r.title,
      link: r.link || r.url,
      snippet: r.snippet || r.snippet_highlighted || ''
    }));
}
