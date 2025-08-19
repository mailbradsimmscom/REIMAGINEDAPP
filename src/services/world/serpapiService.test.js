import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SERPAPI_API_KEY = 'key';
const {
  buildWorldQueries,
  serpapiSearch,
  filterAndRank
} = await import('./serpapiService.js');

test('buildWorldQueries builds tokenized queries with site filters', () => {
  const asset = { manufacturer: 'Acme', model: 'Turbo 2000', model_key: 't2000' };
  const router = {
    allowDomains: ['example.com', 'foo.org'],
    keywords: ['setup'],
    intentKeywords: ['manual']
  };
  const { queries } = buildWorldQueries(asset, router);
  assert.equal(queries.length, 2);
  assert.ok(queries[0].includes('acme turbo 2000 t2000 manual'));
  assert.ok(queries[0].includes('site:example.com'));
  assert.ok(queries[0].includes('site:foo.org'));
  assert.ok(queries[1].includes('setup'));
  assert.ok(queries[1].includes('manual'));
});

test('serpapiSearch iterates queries and dedupes results', async () => {
  const calls = [];
  const map = {
    q1: [{ link: 'https://a.com/1' }, { link: 'https://b.com/2' }],
    q2: [{ link: 'https://b.com/2' }, { link: 'https://c.com/3' }]
  };
  const oldFetch = global.fetch;
  global.fetch = async url => {
    const q = new URL(url).searchParams.get('q');
    calls.push(q);
    return { ok: true, json: async () => ({ organic_results: map[q] || [] }) };
  };
  const res = await serpapiSearch(['q1', 'q2']);
  global.fetch = oldFetch;
  assert.deepEqual(calls, ['q1', 'q2']);
  assert.deepEqual(res.map(r => r.link), [
    'https://a.com/1',
    'https://b.com/2',
    'https://c.com/3'
  ]);
});

test('filterAndRank scores results and returns top K with trust', () => {
  const results = [
    {
      title: 'Manual',
      link: 'https://allowed.com/a.pdf',
      snippet: 'setup instructions'
    },
    {
      title: 'Other',
      link: 'https://other.com/b.doc',
      snippet: 'setup guide'
    },
    {
      title: 'Guide',
      link: 'https://allowed.com/c',
      snippet: 'reference info'
    }
  ];
  const asset = { manufacturer: 'Acme', model: 'Turbo 2000', model_key: 't2000' };
  const router = { allowDomains: ['allowed.com'], keywords: ['setup'], intentKeywords: [] };
  const out = filterAndRank(results, asset, router, 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(r => r.link), [
    'https://allowed.com/a.pdf',
    'https://allowed.com/c'
  ]);
  assert.ok(out.every(r => typeof r.trust === 'number'));
  assert.ok(out.every(r => typeof r.snippet === 'string'));
});
