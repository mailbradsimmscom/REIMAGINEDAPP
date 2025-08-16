const { pineconeAdapter } = require('./pineconeAdapter');

function trivialEmbedBase16(text) {
  const v = new Array(16).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % 16] += text.charCodeAt(i) % 31;
  }
  return v.map(n => n / 100);
}

function tileToDim(arr, dim) {
  const out = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = arr[i % arr.length];
  return out;
}

async function retrieveContext(question, { topK = 5 } = {}) {
  const DIM = parseInt(process.env.VECTOR_DIM || process.env.PINECONE_INDEX_DIM || '3072', 10);
  const base = trivialEmbedBase16(question);
  const vector = tileToDim(base, DIM);
  return pineconeAdapter.query({ vector, topK });
}

module.exports = { vectorService: { retrieveContext } };
