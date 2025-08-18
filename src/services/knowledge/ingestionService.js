import crypto from 'node:crypto';
import { sha1Hex } from '../../utils/hash.js';
import { chunkText } from '../../utils/chunck.js'; // file is intentionally named "chunck.js"
import { embedBatch } from '../ai/openaiAdapter.js';
import { upsertVectors } from '../vector/pineconeAdapter.js';
import { upsertDoc } from '../documentService.js';
import { sanitizeMetadata } from '../vector/meta.js';

export async function ingestText({
  id,
  boat_id,
  system_id,
  knowledge_type,
  title,
  content,
  source,
  tags
}) {
  if (!content || !title || !knowledge_type) {
    throw new Error('Missing required fields: content, title, knowledge_type');
  }

  const version = sha1Hex(content);
  const docId = id || crypto.randomUUID();

  // 1) Supabase truth
  const row = await upsertDoc({
    id: docId,
    boat_id,
    system_id,
    knowledge_type,
    title,
    content,
    source,
    tags,
    version
  });

  // 2) Chunk + embed
  const chunks = chunkText(content);
  const vectors = await embedBatch(chunks); // number[][]

  // 3) Pinecone upsert (no nulls in metadata)
  const pineconeVectors = vectors.map((values, idx) => {
    const meta = {
      docId: row.id,
      version,
      knowledgeType: knowledge_type,
      title,
      text: chunks[idx]
    };
    if (boat_id)  meta.boatId = boat_id;
    if (system_id) meta.systemId = system_id;
    if (source)   meta.source = source;

    return {
      id: `${row.id}:${idx}`,
      values,
      metadata: sanitizeMetadata(meta)
    };
  });

  await upsertVectors(pineconeVectors);

  return { id: row.id, chunks: chunks.length, version };
}
