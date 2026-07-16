import { query } from '../db/pool.js';
import { toPgVectorLiteral } from '../services/embeddingMath.js';

export type KnowledgeDocumentRow = {
  id: string;
  title: string;
  source_filename: string | null;
  created_at: Date;
  chunk_count: number;
};

export type KnowledgeChunkHit = {
  id: string;
  document_id: string;
  content: string;
  distance: number;
};

/** List documents for one user only (D9). */
export async function listDocumentsForUser(userId: string) {
  return query<KnowledgeDocumentRow>(
    `SELECT d.id, d.title, d.source_filename, d.created_at,
            (SELECT COUNT(*)::int FROM knowledge_chunks c WHERE c.document_id = d.id AND c.user_id = $1) AS chunk_count
     FROM knowledge_documents d
     WHERE d.user_id = $1
     ORDER BY d.created_at DESC`,
    [userId]
  );
}

export async function insertDocumentWithChunks(
  userId: string,
  title: string,
  sourceFilename: string | null,
  chunks: Array<{ content: string; embedding: number[] }>
): Promise<{ documentId: string; chunkCount: number }> {
  const doc = await query<{ id: string }>(
    `INSERT INTO knowledge_documents (user_id, title, source_filename)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, title, sourceFilename]
  );
  const documentId = doc.rows[0].id;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await query(
      `INSERT INTO knowledge_chunks (document_id, user_id, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [documentId, userId, i, chunk.content, toPgVectorLiteral(chunk.embedding)]
    );
  }

  return { documentId, chunkCount: chunks.length };
}

/** Delete a document only if it belongs to the user (D9). */
export async function deleteDocumentForUser(userId: string, documentId: string) {
  return query(
    `DELETE FROM knowledge_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
    [documentId, userId]
  );
}

/**
 * Similarity search scoped to one user. Always filters user_id = $1.
 * Uses cosine distance (`<=>`); embeddings must be L2-normalized.
 */
export async function searchChunksForUser(
  userId: string,
  queryEmbedding: number[],
  limit = 5
) {
  return query<KnowledgeChunkHit>(
    `SELECT id, document_id, content, (embedding <=> $2::vector) AS distance
     FROM knowledge_chunks
     WHERE user_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [userId, toPgVectorLiteral(queryEmbedding), limit]
  );
}

export async function countChunksForUser(userId: string) {
  return query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM knowledge_chunks WHERE user_id = $1`,
    [userId]
  );
}

/** Exported for unit tests — the isolation-critical SQL shape. */
export const SEARCH_CHUNKS_SQL = `WHERE user_id = $1`;
