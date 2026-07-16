import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
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

  app.delete('/api/history/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await query(
      `DELETE FROM generations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, request.user!.id]
    );
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'History item not found' });
    }
    await writeAudit(request.user!.id, 'history.delete', { generationId: id });
    return { ok: true };
  });

  app.delete('/api/history', { preHandler: requireAuth }, async (request) => {
    const result = await query(`DELETE FROM generations WHERE user_id = $1`, [request.user!.id]);
    await writeAudit(request.user!.id, 'history.clear', { deleted: result.rowCount ?? 0 });
    return { ok: true, deleted: result.rowCount ?? 0 };
  });
}
