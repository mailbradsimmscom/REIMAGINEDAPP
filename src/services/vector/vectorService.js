// src/services/vector/vectorService.js
import { embedOne } from '../ai/openaiAdapter.js';
import { pcQuery, PineconeNamespaces } from './pineconeAdapter.js';

/**
 * Given a natural language question, embed + vector query Pinecone.
 * Options:
 *  - namespace: '__default__' | 'world'
 *  - topK: number
 * Returns { contextText, references }
 */
export async function retrieveContext(question, {
  namespace,
  topK = Number(process.env.RETRIEVAL_TOPK || 5)
} = {}) {
  const ns = namespace || PineconeNamespaces.DEFAULT;

  const vector = await embedOne(question);
  if (!vector || vector.length === 0) {
    return { contextText: '', references: [] };
  }

  const matches = await pcQuery({ vector, topK, namespace: ns });
  const contextText = matches.map(m => m.text).join('\n');
  const references = matches.map(m => ({
    id: m.id,
    score: m.score,
    source: m.source,
    text: m.text
  }));

  return { contextText, references };
}
