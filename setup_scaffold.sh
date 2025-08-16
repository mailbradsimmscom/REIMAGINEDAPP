#!/usr/bin/env bash
set -euo pipefail

echo "==> Creating directories…"
mkdir -p src/{middleware,routes,controllers,services/{ai,vector,data,responder},views}

echo "==> Writing src/middleware/requestId.js"
cat > src/middleware/requestId.js <<'EOF'
const { v4: uuid } = require('uuid');

const requestId = (req, _res, next) => {
  req.id = req.headers['x-request-id'] || uuid();
  next();
};

module.exports = { requestId };
EOF

echo "==> Writing src/middleware/error.js"
cat > src/middleware/error.js <<'EOF'
const notFound = (req, res, _next) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
};

const errorHandler = (err, req, res, _next) => {
  console.error('[error]', { id: req.id, msg: err.message, stack: err.stack });
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Internal Server Error',
    requestId: req.id,
  });
};

module.exports = { notFound, errorHandler };
EOF

echo "==> Writing src/routes/index.js"
cat > src/routes/index.js <<'EOF'
const { Router } = require('express');
const api = require('./api');

const router = Router();
router.use('/api', api);

module.exports = router;
EOF

echo "==> Writing src/routes/api.js"
cat > src/routes/api.js <<'EOF'
const { Router } = require('express');
const { handleQuery } = require('../controllers/queryController');

const router = Router();
router.post('/query', handleQuery);

module.exports = router;
EOF

echo "==> Writing src/controllers/queryController.js"
cat > src/controllers/queryController.js <<'EOF'
const { z } = require('zod');
const { aiService } = require('../services/ai/aiService');
const { vectorService } = require('../services/vector/vectorService');
const { responder } = require('../services/responder/responder');
const { serialize } = require('../views/serializers');

const bodySchema = z.object({
  question: z.string().min(1),
  metadata: z.record(z.any()).optional()
});

async function handleQuery(req, res, next) {
  try {
    const { question, metadata } = bodySchema.parse(req.body);

    const ctx = await vectorService.retrieveContext(question, { topK: 5 });
    const draft = await aiService.answerQuestion(question, ctx, { metadata });

    const styled = await responder.applyToneAndFormat(draft, {
      tone: 'professional-conversational',
      audience: 'general',
      constraints: { maxSentences: 12, avoid: ['hedging', 'purple prose'] }
    });

    const payload = serialize(styled, { shape: 'api' });
    res.json(payload);
  } catch (err) {
    err.status = err.status || 400;
    err.publicMessage = err.publicMessage || err.message;
    next(err);
  }
}

module.exports = { handleQuery };
EOF

echo "==> Writing src/services/responder/responder.js"
cat > src/services/responder/responder.js <<'EOF'
const templates = {
  base({ title, summary, bullets = [], cta, raw }) {
    return { title, summary, bullets, cta, raw };
  }
};

async function applyToneAndFormat(draft, opts = {}) {
  const text = typeof draft === 'string' ? draft : (draft.text || '');

  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\s,/, ',')
    .trim();

  const title = (opts.title || 'Answer').trim();
  const summary = cleaned.split(/(?<=\.)\s+/).slice(0, 2).join(' ');
  const rest = cleaned.slice(summary.length).trim();

  const bullets = rest
    .split(/(?<=\.)\s+/)
    .filter(Boolean)
    .slice(0, 6);

  const cta = opts.cta || undefined;

  return templates.base({
    title,
    summary,
    bullets,
    cta,
    raw: draft
  });
}

module.exports = { responder: { applyToneAndFormat } };
EOF

echo "==> Writing src/views/serializers.js"
cat > src/views/serializers.js <<'EOF'
function serialize(responderPayload, { shape = 'api' } = {}) {
  return {
    title: responderPayload.title,
    summary: responderPayload.summary,
    bullets: responderPayload.bullets,
    cta: responderPayload.cta || null,
    raw: responderPayload.raw
  };
}

module.exports = { serialize };
EOF

echo "==> Writing src/services/ai/openaiAdapter.js"
cat > src/services/ai/openaiAdapter.js <<'EOF'
const { OpenAI } = require('openai');

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

async function complete({ prompt, system }) {
  const client = createClient();
  if (!client) {
    return { text: ${'`'}MOCK: ${'${prompt.slice(0, 120)}'}...${'`'} };
  }

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  });

  const text = resp.choices?.[0]?.message?.content || '';
  return { text };
}

module.exports = { openaiAdapter: { complete } };
EOF

echo "==> Writing src/services/ai/aiService.js"
cat > src/services/ai/aiService.js <<'EOF'
const { openaiAdapter } = require('./openaiAdapter');

async function answerQuestion(question, contextList = [], { metadata } = {}) {
  const contextBlock = contextList
    .map((c, i) => `# Context ${i + 1}\n${c.text || c.content || ''}`)
    .join('\n\n');

  const system = [
    'You are a precise, helpful assistant.',
    'Respond concisely, using active voice.',
    'Do not invent facts; if unsure, say so briefly.'
  ].join(' ');

  const prompt = [
    contextBlock ? `Use this context:\n${contextBlock}\n` : '',
    `Question: ${question}\n`,
    metadata ? `Metadata: ${JSON.stringify(metadata).slice(0, 500)}\n` : '',
    'Answer clearly and directly.'
  ].join('\n');

  const out = await openaiAdapter.complete({ prompt, system });
  return {
    text: out.text,
    references: contextList.map(c => c.source).filter(Boolean)
  };
}

module.exports = { aiService: { answerQuestion } };
EOF

echo "==> Writing src/services/vector/pineconeAdapter.js"
cat > src/services/vector/pineconeAdapter.js <<'EOF'
const { Pinecone } = require('@pinecone-database/pinecone');

function createClient() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX || process.env.PINECONE_INDEX_NAME;
  if (!apiKey || !indexName) return null;

  const client = new Pinecone({ apiKey });
  const index = client.index(indexName);
  return { client, index };
}

async function query({ vector, topK = 5 }) {
  const pcs = createClient();
  if (!pcs) {
    return [
      { id: 'mock-1', score: 0.9, text: 'Mock context A', source: 'mock' },
      { id: 'mock-2', score: 0.85, text: 'Mock context B', source: 'mock' }
    ].slice(0, topK);
  }
  const res = await pcs.index.query({ topK, vector, includeMetadata: true });
  return (res.matches || []).map(m => ({
    id: m.id,
    score: m.score,
    text: m.metadata?.text || '',
    source: m.metadata?.source || ''
  }));
}

module.exports = { pineconeAdapter: { query } };
EOF

echo "==> Writing src/services/vector/vectorService.js"
cat > src/services/vector/vectorService.js <<'EOF'
const { pineconeAdapter } = require('./pineconeAdapter');

function trivialEmbed(text) {
  const v = new Array(16).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % 16] += text.charCodeAt(i) % 31;
  }
  return v.map(n => n / 100);
}

async function retrieveContext(question, { topK = 5 } = {}) {
  const vector = trivialEmbed(question);
  return pineconeAdapter.query({ vector, topK });
}

module.exports = { vectorService: { retrieveContext } };
EOF

echo "==> Writing src/services/data/supabaseAdapter.js"
cat > src/services/data/supabaseAdapter.js <<'EOF'
const { createClient } = require('@supabase/supabase-js');

function createSb() {
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional for now
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { persistSession: false } });
}

async function upsertInteraction({ question, answer, meta }) {
  const sb = createSb();
  if (!sb) return { id: 'mock-log' };

  const { data, error } = await sb.from('interactions').insert({
    question,
    answer,
    meta,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) throw error;
  return data;
}

module.exports = { supabaseAdapter: { upsertInteraction } };
EOF

echo "==> Writing src/services/data/dataService.js"
cat > src/services/data/dataService.js <<'EOF'
const { supabaseAdapter } = require('./supabaseAdapter');

async function logInteraction({ question, answer, meta }) {
  try {
    return await supabaseAdapter.upsertInteraction({ question, answer, meta });
  } catch (e) {
    console.warn('[dataService] logInteraction failed:', e.message);
    return null;
  }
}

module.exports = { dataService: { logInteraction } };
EOF

# Optional: make the green Run button start dev server
echo "==> Writing .replit (optional)"
cat > .replit <<'EOF'
run = "npm run dev"
EOF

echo "==> Done. Next:"
echo "   1) npm install"
echo "   2) npm run dev"
echo "   3) In a new shell: curl -s http://localhost:3000/health"
