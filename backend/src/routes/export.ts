import type { FastifyInstance } from 'fastify';
import { PassThrough } from 'node:stream';
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
import type { RateLimitPreHandler } from '../rateLimit.js';
import { isAbortError } from '../http/timeout.js';

const exportSchema = z.object({
  epics: z.array(z.unknown()).min(1),
  generationId: z.string().uuid().optional(),
});

type NdjsonEvent =
  | { type: 'progress'; message: string }
  | {
      type: 'done';
      ok: true;
      progress: string[];
      created: Array<{
        kind: 'epic' | 'feature' | 'story';
        title: string;
        id: string;
        url: string;
        key?: string;
      }>;
    }
  | { type: 'error'; error: string; progress: string[] };

export async function exportRoutes(
  app: FastifyInstance,
  opts: { exportLimit: RateLimitPreHandler }
) {
  app.post(
    '/api/export',
    { preHandler: [requireAuth, opts.exportLimit] },
    async (request, reply) => {
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
      const abort = new AbortController();
      const onClose = () => {
        abort.abort();
      };
      request.raw.on('close', onClose);

      const progress: string[] = [];
      const stream = new PassThrough();

      const writeLine = (event: NdjsonEvent) => {
        if (!stream.destroyed) {
          stream.write(`${JSON.stringify(event)}\n`);
        }
      };

      void (async () => {
        try {
          const adapter = createTrackerAdapter(trackerConfig, { signal: abort.signal });
          const { created } = await exportBacklog(
            adapter,
            parsed.data.epics as Parameters<typeof exportBacklog>[1],
            (msg) => {
              progress.push(msg);
              writeLine({ type: 'progress', message: msg });
            }
          );
          await writeAudit(request.user!.id, 'export', {
            provider: trackerConfig.provider,
            generationId: parsed.data.generationId,
            epicCount: parsed.data.epics.length,
            createdCount: created.length,
          });
          writeLine({
            type: 'done',
            ok: true,
            progress,
            created: created.map((item) => ({
              kind: item.kind,
              title: item.title,
              id: item.ref.id,
              url: item.ref.url,
              key: item.ref.key,
            })),
          });
        } catch (err) {
          console.error(err);
          const message = isAbortError(err)
            ? 'Export aborted'
            : err instanceof Error
              ? err.message
              : 'Export failed';
          writeLine({ type: 'error', error: message, progress });
        } finally {
          request.raw.off('close', onClose);
          stream.end();
        }
      })();

      return reply.type('application/x-ndjson; charset=utf-8').send(stream);
    }
  );

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
