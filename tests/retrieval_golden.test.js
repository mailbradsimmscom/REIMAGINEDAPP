import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// Required environment variables for env.js
process.env.PINECONE_INDEX = 'test-index';
process.env.PINECONE_NAMESPACE = 'test-ns';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc_key';
process.env.OPENAI_API_KEY = 'test-key';

const { default: bffRouter } = await import('../src/routes/bff.js');

function makeServer() {
  const app = express();
  app.use(express.json());
  app.use('/bff', bffRouter);
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function query(question, references) {
  const server = await makeServer();
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}/bff/web/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context: '1. info', references })
  });
  const body = await res.json();
  server.close();
  return { res, body };
}

test('returns asset references', async () => {
  const refs = [{ id: 'a1', source: 'asset-manual.pdf' }];
  const { res, body } = await query('asset question', refs);
  assert.equal(res.status, 200);
  assert.ok(body.title);
  assert.ok(body.summary);
  assert.deepEqual(body._structured.raw.references, refs);
});

test('returns playbook references', async () => {
  const refs = [{ id: 'pb1', source: 'playbook-guide.pdf' }];
  const { res, body } = await query('playbook question', refs);
  assert.equal(res.status, 200);
  assert.ok(body.title);
  assert.ok(body.summary);
  assert.deepEqual(body._structured.raw.references, refs);
});

test('returns web references', async () => {
  const refs = [{ id: 'https://example.com', source: 'https://example.com' }];
  const { res, body } = await query('web question', refs);
  assert.equal(res.status, 200);
  assert.ok(body.title);
  assert.ok(body.summary);
  assert.deepEqual(body._structured.raw.references, refs);
});

