import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { generateStoriesServer } from '../services/gemini.js';
import { query } from '../db/pool.js';

const bodySchema = z.object({
  requirement: z.string().min(1),
  knowledgeBase: z.string().optional().default(''),
});

export async function generateRoutes(app: FastifyInstance) {
  app.post('/api/generate', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const epics = await generateStoriesServer(
        parsed.data.requirement,
        parsed.data.knowledgeBase
      );
      const title = epics[0]?.epic || 'Untitled Plan';
      const insert = await query<{ id: string }>(
        `INSERT INTO generations (user_id, title, result_json)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id`,
        [request.user!.id, title, JSON.stringify(epics)]
      );
      return { generationId: insert.rows[0].id, epics };
    } catch (err) {
      console.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  });
}
