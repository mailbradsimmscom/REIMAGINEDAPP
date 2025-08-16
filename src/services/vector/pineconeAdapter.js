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
