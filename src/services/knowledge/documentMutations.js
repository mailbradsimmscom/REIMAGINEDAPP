import { sha1Hex } from '../../utils/hash.js';
import { chunkText } from '../../utils/chunck.js'; // file is intentionally named "chunck.js"
import { embedBatch } from '../ai/openaiAdapter.js';
import { deleteByFilter, upsertVectors } from '../vector/pineconeAdapter.js';
import { getDoc, updateDocVersionAndContent, softDeleteDoc } from '../documentService.js';
import { sanitizeMetadata } from '../vector/meta.js';

export async function updateDocument(id, { content, title, source, tags }) {
  const current = await getDoc(id);
  if (!current) throw new Error('Document not found');

  const newContent = content ?? current.content;
  const newVersion = sha1Hex(newContent);
  const metaOnlyChange =
    content === undefined &&
    (title !== undefined || source !== undefined || tags !== undefined);

  if (current.version === newVersion && !metaOnlyChange) {
    return { id, updated: false, reason: 'no_change' };
  }

  let reindexed = false;

  if (current.version !== newVersion) {
    // purge existing vectors for this doc
    await deleteByFilter({ docId: id });

    const chunks = chunkText(newContent);
    const vectors = await embedBatch(chunks);

    const pineconeVectors = vectors.map((values, idx) => {
      const meta = {
        docId: id,
        version: newVersion,
        knowledgeType: current.knowledge_type,
        title: title ?? current.title,
        text: chunks[idx]
      };
      if (current.boat_id)   meta.boatId = current.boat_id;
      if (current.system_id) meta.systemId = current.system_id;
      if (source ?? current.source) meta.source = source ?? current.source;

      return {
        id: `${id}:${idx}`,
        values,
        metadata: sanitizeMetadata(meta)
      };
    });

    await upsertVectors(pineconeVectors);
    reindexed = true;
  }

  const patched = await updateDocVersionAndContent(id, {
    content: newContent,
    version: newVersion,
    ...(title  !== undefined ? { title }  : {}),
    ...(source !== undefined ? { source } : {}),
    ...(tags   !== undefined ? { tags }   : {})
  });

  return {
    id,
    updated: true,
    reindexed,
    version: newVersion,
    title: patched.title,
    source: patched.source,
    tags: patched.tags
  };
}

export async function deleteDocument(id) {
  const row = await softDeleteDoc(id);
  await deleteByFilter({ docId: id });
  return { id, deleted_at: row.deleted_at };
}
