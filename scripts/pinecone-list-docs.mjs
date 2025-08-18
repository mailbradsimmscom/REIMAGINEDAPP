import 'dotenv/config';
import fs from 'node:fs';
import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX;
// Empty string targets the default namespace (what the UI shows as __default__)
const ns = (process.env.PINECONE_NAMESPACE ?? '');

if (!apiKey || !indexName) {
  throw new Error('Set PINECONE_API_KEY and PINECONE_INDEX');
}

const pc = new Pinecone({ apiKey });
const indexRoot = pc.index(indexName);
const index = indexRoot.namespace(ns);

// get dimension so we can build a zero vector to retrieve everything
const stats = await indexRoot.describeIndexStats({});
const dim = stats.dimension ?? 3072;

// query for up to 1000 chunks (you have ~150), and include metadata
const res = await index.query({
  vector: new Array(dim).fill(0),
  topK: Number(process.env.TOPK || 1000),
  includeMetadata: true,
  includeValues: false,
});

const matches = res.matches ?? [];

// normalize rows
const rows = matches.map(m => ({
  id: m.id,
  score: m.score,
  // prefer metadata.docId; else derive from "docId:chunk" pattern
  docId: m.metadata?.docId ?? (m.id.includes(':') ? m.id.split(':')[0] : null),
  title: m.metadata?.title ?? null,
  source: m.metadata?.source ?? null,
  version: m.metadata?.version ?? null,
}));

// group by docId (or by full id if no docId present)
const grouped = new Map();
for (const r of rows) {
  const key = r.docId ?? r.id;
  const entry = grouped.get(key) ?? { docId: key, chunks: 0, title: '', source: '', versions: new Set() };
  entry.chunks += 1;
  if (!entry.title && r.title) entry.title = r.title;
  if (!entry.source && r.source) entry.source = r.source;
  if (r.version) entry.versions.add(r.version);
  grouped.set(key, entry);
}

const docs = [...grouped.values()].map(d => ({
  docId: d.docId,
  chunks: d.chunks,
  title: d.title,
  source: d.source,
  versions: [...d.versions].join(','),
}));

console.table(docs);
fs.writeFileSync('./pinecone_default_docs.json', JSON.stringify(docs, null, 2));
console.log('Wrote pinecone_default_docs.json with', docs.length, 'docs (namespace:', ns || '__default__', ')');
