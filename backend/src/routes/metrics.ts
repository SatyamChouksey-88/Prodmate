import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { query } from '../db/pool.js';

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function metricsRoutes(app: FastifyInstance) {
  app.get('/api/metrics/summary', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = rangeSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
    const from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const userId = request.user!.id;

    const exportCount = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs
       WHERE user_id = $1 AND action = 'export'
         AND created_at >= $2 AND created_at <= $3`,
      [userId, from.toISOString(), to.toISOString()]
    );

    const generateCount = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs
       WHERE user_id = $1 AND action = 'generate'
         AND created_at >= $2 AND created_at <= $3`,
      [userId, from.toISOString(), to.toISOString()]
    );

    const editProxy = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs
       WHERE user_id = $1 AND action = 'review.edit'
         AND created_at >= $2 AND created_at <= $3`,
      [userId, from.toISOString(), to.toISOString()]
    );

    // Measured: pair generate→export by generationId when both exist.
    const durations = await query<{ duration_ms: number }>(
      `WITH gens AS (
         SELECT metadata->>'generationId' AS gid, created_at AS gen_at
         FROM audit_logs
         WHERE user_id = $1 AND action = 'generate'
           AND created_at >= $2 AND created_at <= $3
           AND metadata ? 'generationId'
       ),
       exps AS (
         SELECT metadata->>'generationId' AS gid, created_at AS exp_at
         FROM audit_logs
         WHERE user_id = $1 AND action = 'export'
           AND created_at >= $2 AND created_at <= $3
           AND metadata ? 'generationId'
       )
       SELECT EXTRACT(EPOCH FROM (e.exp_at - g.gen_at)) * 1000 AS duration_ms
       FROM gens g
       JOIN exps e ON e.gid = g.gid
       WHERE e.exp_at >= g.gen_at`,
      [userId, from.toISOString(), to.toISOString()]
    );

    const msValues = durations.rows
      .map((r) => Number(r.duration_ms))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const avgGenerateToExportMs =
      msValues.length > 0
        ? Math.round(msValues.reduce((a, b) => a + b, 0) / msValues.length)
        : null;

    const recent = await query<{
      action: string;
      metadata: unknown;
      created_at: string;
    }>(
      `SELECT action, metadata, created_at::text
       FROM audit_logs
       WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at DESC
       LIMIT 25`,
      [userId, from.toISOString(), to.toISOString()]
    );

    return {
      ok: true,
      range: { from: from.toISOString(), to: to.toISOString() },
      metrics: [
        {
          id: 'export_count',
          label: 'Exports completed',
          value: Number(exportCount.rows[0]?.count ?? 0),
          kind: 'measured' as const,
          how: "COUNT of audit_logs where action = 'export' in range",
        },
        {
          id: 'generate_count',
          label: 'Generations completed',
          value: Number(generateCount.rows[0]?.count ?? 0),
          kind: 'measured' as const,
          how: "COUNT of audit_logs where action = 'generate' in range",
        },
        {
          id: 'generate_to_export_ms',
          label: 'Avg generate→export time (ms)',
          value: avgGenerateToExportMs,
          kind: 'measured' as const,
          how: 'Mean of (export.created_at − generate.created_at) joined on metadata.generationId; only paired rows',
          sampleSize: msValues.length,
        },
        {
          id: 'review_edit_proxy',
          label: 'Review/refine edits',
          value: Number(editProxy.rows[0]?.count ?? 0),
          kind: 'proxy' as const,
          how: "COUNT of audit_logs where action = 'review.edit' — refinement-effort proxy, not wall-clock editing time",
        },
      ],
      recentActions: recent.rows,
    };
  });
}
