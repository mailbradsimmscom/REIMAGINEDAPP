import 'dotenv/config';

import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX;
if (!apiKey || !indexName) throw new Error('Set PINECONE_API_KEY and PINECONE_INDEX');

const pc = new Pinecone({ apiKey });
const index = pc.index(indexName);

const stats = await index.describeIndexStats({});
const namespaces = Object.entries(stats.namespaces || {}).map(([name, meta]) => ({
  name, recordCount: meta?.recordCount ?? meta?.vectorCount ?? 0
}));

console.log(JSON.stringify({
  index: indexName,
  dimension: stats.dimension,
  namespaces
}, null, 2));
