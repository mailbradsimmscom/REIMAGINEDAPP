import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PINECONE_INDEX = 'test-index';
process.env.PINECONE_NAMESPACE = 'test-ns';
process.env.SERPAPI_API_KEY = 'test-serp';

function makeDeps(vectorCount, fetchFn) {
  return {
    searchPlaybooks: async () => [{
      id: 'pb1',
      title: 'PB',
      summary: 'Sum',
      steps: ['hidden step'],
      safety: 'safe',
      ref_domains: ['allowed.com']
    }],
    formatPlaybookBlock: row => ({ id: row.id, source: 'pb' }),
    derivePlaybookKeywords: () => ['foo'],
    buildWorldQueries: () => ({
      queries: ['q']
    }),
    serpapiSearch: async qs => {
      assert.deepEqual(qs, ['q']);
      return [
        { link: 'https://allowed.com/a' },
        { link: 'https://other.com/b' }
      ];
    },
    filterAndRank: (items, asset, router, topK) => items.slice(0, Number(topK) || items.length),
    fetchAndChunk: fetchFn,
    aiService: { embed: async () => [0.1, 0.2, 0.3] },
    pineconeAdapter: {
      query: async ({ namespace }) => {
        if (String(namespace || '').startsWith('world')) return [];
        return Array.from({ length: vectorCount }, (_, i) => ({
          id: `v${i + 1}`,
          text: `foo vec${i + 1}`,
          score: 0.9 - i * 0.1,
          source: 'default'
        }));
      }
    }
  };
}

test('worldSearch fetches allowed domain when parts below threshold', async () => {
  process.env.WORLD_SEARCH_ENABLED = '1';
  process.env.WORLD_SEARCH_PARTS_THRESHOLD = '3';

  let fetchCalledWith = null;
  const deps = makeDeps(1, async url => {
    fetchCalledWith = url;
    return [{ text: 'world data', url, source: 'oem' }];
  });
  const { buildContextMix } = await import('./mixerService.js');
  const res = await buildContextMix({ question: 'foo question', namespace: 'x' }, deps);

  assert.equal(fetchCalledWith, 'https://allowed.com/a');
  assert.match(res.contextText, /world data/);
  assert.ok(res.references.some(r => r.source === 'https://allowed.com/a'));
  assert.ok(!res.contextText.includes('hidden step'));
});

test('worldSearch uses WORLD_ALLOWLIST when no playbook domains', async () => {
  process.env.WORLD_SEARCH_ENABLED = '1';
  process.env.WORLD_SEARCH_PARTS_THRESHOLD = '3';
  process.env.WORLD_ALLOWLIST = 'allowed.com';

  let fetchCalledWith = null;
  const deps = makeDeps(1, async url => {
    fetchCalledWith = url;
    return [{ text: 'world data', url, source: 'oem' }];
  });
  deps.searchPlaybooks = async () => [{
    id: 'pb1',
    title: 'PB',
    summary: 'Sum',
    steps: ['hidden step'],
    safety: 'safe',
    ref_domains: []
  }];

  const { buildContextMix } = await import('./mixerService.js');
  const res = await buildContextMix({ question: 'foo question', namespace: 'x' }, deps);

  assert.deepEqual(res.meta.allow_domains, []);
  assert.equal(fetchCalledWith, 'https://allowed.com/a');
  assert.match(res.contextText, /world data/);
  assert.ok(res.references.some(r => r.source === 'https://allowed.com/a'));
  assert.ok(!res.contextText.includes('hidden step'));
});

test('worldSearch skipped when parts exceed threshold', async () => {
  process.env.WORLD_SEARCH_ENABLED = '1';
  process.env.WORLD_SEARCH_PARTS_THRESHOLD = '3';

  let called = false;
  const deps = makeDeps(3, async () => {
    called = true;
    return [{ text: 'world data', url: 'x', source: 'oem' }];
  });
  const { buildContextMix } = await import('./mixerService.js');
  const res = await buildContextMix({ question: 'foo question', namespace: 'x' }, deps);

  assert.equal(res.meta.pruned_default, 3);
  assert.equal(called, false);
  assert.ok(!res.contextText.includes('world data'));
});

test('worldSearch can be disabled via env toggle', async () => {
  process.env.WORLD_SEARCH_ENABLED = '0';
  process.env.WORLD_SEARCH_PARTS_THRESHOLD = '3';

  let called = false;
  const deps = makeDeps(1, async () => {
    called = true;
    return [{ text: 'world data', url: 'x', source: 'oem' }];
  });
  const { buildContextMix } = await import('./mixerService.js');
  const res = await buildContextMix({ question: 'foo question', namespace: 'x' }, deps);

  assert.equal(called, false);
  assert.ok(!res.contextText.includes('world data'));
});
