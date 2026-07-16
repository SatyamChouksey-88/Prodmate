import { embedQuery } from '../services/embeddings.js';
import { countChunksForUser, searchChunksForUser } from './queries.js';

const TOP_K = 5;

/**
 * Build knowledge context for generate:
 * - If user has ingested chunks, retrieve top-k by similarity to the requirement.
 * - Manual textarea is always appended as override / extra context when provided.
 * - If nothing ingested, textarea alone is used (fallback).
 */
export async function buildKnowledgeContext(
  userId: string,
  requirement: string,
  manualKnowledgeBase: string
): Promise<{ knowledgeBase: string; retrievedCount: number }> {
  const manual = manualKnowledgeBase.trim();
  const countRes = await countChunksForUser(userId);
  const hasStore = (countRes.rows[0]?.count ?? 0) > 0;

  if (!hasStore) {
    return { knowledgeBase: manual, retrievedCount: 0 };
  }

  const queryVec = await embedQuery(requirement);
  const hits = await searchChunksForUser(userId, queryVec, TOP_K);
  const retrieved = hits.rows.map((h) => h.content).join('\n\n---\n\n');

  const parts: string[] = [];
  if (retrieved) {
    parts.push(`Retrieved from your knowledge mesh:\n\n${retrieved}`);
  }
  if (manual) {
    parts.push(`Additional context (manual override):\n\n${manual}`);
  }

  return {
    knowledgeBase: parts.join('\n\n'),
    retrievedCount: hits.rows.length,
  };
}
