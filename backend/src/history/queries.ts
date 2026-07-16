import { query } from '../db/pool.js';

/**
 * All history access must pass the authenticated user id (D9).
 * Never accept a client-supplied user_id for these queries.
 */
export async function listGenerationsForUser(userId: string) {
  return query<{
    id: string;
    title: string;
    result_json: unknown;
    created_at: Date;
  }>(
    `SELECT id, title, result_json, created_at
     FROM generations
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
}

export async function deleteGenerationForUser(userId: string, generationId: string) {
  return query(`DELETE FROM generations WHERE id = $1 AND user_id = $2 RETURNING id`, [
    generationId,
    userId,
  ]);
}

export async function clearGenerationsForUser(userId: string) {
  return query(`DELETE FROM generations WHERE user_id = $1`, [userId]);
}
