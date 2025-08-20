import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.PINECONE_INDEX = 'test-index';
process.env.PINECONE_NAMESPACE = 'test-ns';
process.env.RETRIEVAL_FTS_ENABLED = 'true';
process.env.OPENAI_API_KEY = '';

const { default: bffRouter } = await import('../src/routes/bff.js');

function makeServer() {
  const app = express();
  app.use(express.json());
  app.use('/bff', bffRouter);
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function query(question) {
  const server = await makeServer();
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}/bff/web/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });
  const body = await res.json();
  server.close();
  return { res, body };
}

test('fts retrieval returns gps assets and playbooks', async () => {
  const { res, body } = await query('tell me about my GPS');
  assert.equal(res.status, 200);
  assert.deepEqual(body._retrievalMeta.tokens, ['gps']);
  assert.equal(body._retrievalMeta.mode, 'fts');
  assert.ok(Array.isArray(body.assets) && body.assets.length > 0);
  assert.ok(Array.isArray(body.playbooks) && body.playbooks.length > 0);
});
