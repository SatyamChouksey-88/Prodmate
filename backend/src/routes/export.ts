import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
import { decryptJson } from '../crypto/credentials.js';
import { query } from '../db/pool.js';
import {
  createTrackerAdapter,
  exportBacklog,
  type TrackerConfig,
} from '../trackers/index.js';

const exportSchema = z.object({
  epics: z.array(z.unknown()).min(1),
  generationId: z.string().uuid().optional(),
});

export async function exportRoutes(app: FastifyInstance) {
  app.post('/api/export', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = exportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const configRow = await query<{ config_ciphertext: string }>(
      `SELECT config_ciphertext FROM tracker_configs WHERE user_id = $1`,
      [request.user!.id]
    );
    if (!configRow.rows[0]) {
      return reply.code(400).send({ error: 'No tracker settings saved. Save settings first.' });
    }

    const trackerConfig = decryptJson<TrackerConfig>(configRow.rows[0].config_ciphertext);
    const adapter = createTrackerAdapter(trackerConfig);
    const progress: string[] = [];

    try {
      await exportBacklog(adapter, parsed.data.epics as Parameters<typeof exportBacklog>[1], (msg) => {
        progress.push(msg);
      });
      await writeAudit(request.user!.id, 'export', {
        provider: trackerConfig.provider,
        generationId: parsed.data.generationId,
        epicCount: parsed.data.epics.length,
      });
      return { ok: true, progress };
    } catch (err) {
      console.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : 'Export failed',
        progress,
      });
    }
  });

  app.post('/api/tracker/test', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as TrackerConfig | undefined;
    if (!body?.provider) {
      return reply.code(400).send({ error: 'Tracker config required' });
    }
    try {
      const message = await createTrackerAdapter(body).testConnection();
      await writeAudit(request.user!.id, 'tracker.test', { provider: body.provider });
      return { ok: true, message };
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : 'Connection test failed',
      });
    }
  });
}
