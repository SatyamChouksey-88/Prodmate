import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { query } from '../db/pool.js';

/**
 * History from generations table — always scoped to the authenticated user (D9).
 */
export async function historyRoutes(app: FastifyInstance) {
  app.get('/api/history', { preHandler: requireAuth }, async (request) => {
    const result = await query<{
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
      [request.user!.id]
    );

    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      date: new Date(row.created_at).toLocaleString(),
      data: row.result_json,
    }));

    return { items };
  });
}
