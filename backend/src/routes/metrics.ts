import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
import { query } from '../db/pool.js';
import { computeMetricsSummary } from '../metrics/summary.js';
import type { RateLimitPreHandler } from '../rateLimit.js';

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function metricsRoutes(
  app: FastifyInstance,
  opts: { interactionLimit: RateLimitPreHandler }
) {
  const gate = [requireAuth, opts.interactionLimit];

  /**
   * Fire-and-forget metrics ping when a user commits a manual field edit in review.
   * Distinct from LLM refine (`editKind: 'refine'`); dashboard sums both under review.edit.
   */
  app.post(
    '/api/generations/:id/edit-ping',
    { preHandler: gate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const owned = await query(
        `SELECT 1 FROM generations WHERE id = $1 AND user_id = $2`,
        [id, request.user!.id]
      );
      if ((owned.rowCount ?? 0) === 0) {
        return reply.code(404).send({ error: 'Generation not found' });
      }
      await writeAudit(request.user!.id, 'review.edit', {
        generationId: id,
        editKind: 'field',
      });
      return reply.code(204).send();
    }
  );

  app.get('/api/metrics/summary', { preHandler: gate }, async (request, reply) => {
    const parsed = rangeSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
    const from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    return computeMetricsSummary(request.user!.id, from, to);
  });
}
