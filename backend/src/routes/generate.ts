import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
import { generateStoriesServer } from '../services/gemini.js';
import { query } from '../db/pool.js';
import type { RateLimitPreHandler } from '../rateLimit.js';
import { buildKnowledgeContext } from '../knowledge/retrieve.js';

const bodySchema = z.object({
  requirement: z.string().min(1),
  knowledgeBase: z.string().optional().default(''),
});

export async function generateRoutes(
  app: FastifyInstance,
  opts: { generateLimit: RateLimitPreHandler }
) {
  app.post(
    '/api/generate',
    { preHandler: [requireAuth, opts.generateLimit] },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const { knowledgeBase, retrievedCount } = await buildKnowledgeContext(
          request.user!.id,
          parsed.data.requirement,
          parsed.data.knowledgeBase
        );

        const epics = await generateStoriesServer(parsed.data.requirement, knowledgeBase);
        const title = epics[0]?.epic || 'Untitled Plan';
        const insert = await query<{ id: string }>(
          `INSERT INTO generations (user_id, title, result_json)
           VALUES ($1, $2, $3::jsonb)
           RETURNING id`,
          [request.user!.id, title, JSON.stringify(epics)]
        );
        const generationId = insert.rows[0].id;
        await writeAudit(request.user!.id, 'generate', {
          generationId,
          epicCount: epics.length,
          retrievedChunkCount: retrievedCount,
        });
        return { generationId, epics, retrievedChunkCount: retrievedCount };
      } catch (err) {
        console.error(err);
        return reply.code(502).send({
          error: err instanceof Error ? err.message : 'Generation failed',
        });
      }
    }
  );
}
