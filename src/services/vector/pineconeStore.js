import { Pinecone } from '@pinecone-database/pinecone';

const INDEX = process.env.PINECONE_INDEX;
const NS    = (process.env.PINECONE_NAMESPACE ?? '').trim();    // production namespace
const WORLD = (process.env.WORLD_NAMESPACE ?? 'world').trim();  // read-only

if (!INDEX) throw new Error('Missing PINECONE_INDEX');
if (!NS) throw new Error('PINECONE_NAMESPACE must be set (prod namespace)');
if (NS === WORLD || NS === 'world') throw new Error('Refusing to operate: PINECONE_NAMESPACE may not be "world".');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const idxRoot = pc.index(INDEX);
const ns = () => idxRoot.namespace(NS);

export async function upsertChunks(docId, parts, baseMeta = {}) {
  // parts: [{ vector:number[], idx:number }]
  if (!docId) throw new Error('upsertChunks: docId required');
  const vectors = parts.map(({ vector, idx }) => ({
    id: `${docId}:${idx}`,
    values: vector,
    metadata: { docId, ...baseMeta }
  }));
  await ns().upsert(vectors);
  return { upserted: vectors.length, namespace: NS };
}

export async function deleteByDocId(docId) {
  if (!docId) return { deleted: false };
  await ns().deleteMany({ filter: { docId } });
  return { deleted: true, namespace: NS };
}

export async function queryOwn(embedding, topK = 5, filter = {}) {
  const r = await ns().query({ vector: embedding, topK, includeMetadata: true, includeValues: false, filter });
  return (r.matches || []).map(m => ({ ...m, namespace: NS }));
}

export async function queryWorld(embedding, topK = 5, filter = {}) {
  const world = idxRoot.namespace(WORLD);
  const r = await world.query({ vector: embedding, topK, includeMetadata: true, includeValues: false, filter });
  return (r.matches || []).map(m => ({ ...m, namespace: WORLD }));
}
