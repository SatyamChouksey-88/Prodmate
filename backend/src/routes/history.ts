import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
import {
  clearGenerationsForUser,
  deleteGenerationForUser,
  listGenerationsForUser,
} from '../history/queries.js';

/**
 * History from generations table — always scoped to the authenticated user (D9).
 */
export async function historyRoutes(app: FastifyInstance) {
  app.get('/api/history', { preHandler: requireAuth }, async (request) => {
    const result = await listGenerationsForUser(request.user!.id);

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
    const result = await deleteGenerationForUser(request.user!.id, id);
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'History item not found' });
    }
    await writeAudit(request.user!.id, 'history.delete', { generationId: id });
    return { ok: true };
  });

  app.delete('/api/history', { preHandler: requireAuth }, async (request) => {
    const result = await clearGenerationsForUser(request.user!.id);
    await writeAudit(request.user!.id, 'history.clear', { deleted: result.rowCount ?? 0 });
    return { ok: true, deleted: result.rowCount ?? 0 };
  });
}
