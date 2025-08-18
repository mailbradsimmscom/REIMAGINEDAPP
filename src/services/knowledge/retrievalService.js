import { embedQuery } from '../ai/openaiAdapter.js';
import { pcQuery, PineconeNamespaces } from '../vector/pineconeAdapter.js';

/**
 * Search your prod namespace; optionally merge with world.
 */
export async function semanticSearch({ query, topK = 5, includeWorld = true, filter = {} }) {
  const qVec = await embedQuery(query);

  const own = await pcQuery({ vector: qVec, topK, namespace: PineconeNamespaces.DEFAULT, filter });
  if (!includeWorld) return own;

  const world = await pcQuery({ vector: qVec, topK, namespace: PineconeNamespaces.WORLD, filter });
  const merged = [...own, ...world].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return merged.slice(0, topK);
}
