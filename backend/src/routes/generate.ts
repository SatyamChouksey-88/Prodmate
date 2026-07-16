import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
import { generateStoriesServer, refineStoryServer } from '../services/gemini.js';
import { query } from '../db/pool.js';
import type { RateLimitPreHandler } from '../rateLimit.js';
import { buildKnowledgeContext } from '../knowledge/retrieve.js';

const bodySchema = z.object({
  requirement: z.string().min(1),
  knowledgeBase: z.string().optional().default(''),
});

const refineSchema = z.object({
  instruction: z.string().min(1).max(2000),
  epicIndex: z.number().int().min(0),
  featureIndex: z.number().int().min(0),
  storyId: z.string().min(1),
  epics: z.array(z.unknown()).min(1),
  generationId: z.string().uuid().optional(),
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
        const startedAt = new Date().toISOString();
        const abort = new AbortController();
        const onClose = () => {
          if (!reply.sent) abort.abort();
        };
        request.raw.on('close', onClose);

        await writeAudit(request.user!.id, 'generate.start', { startedAt });

        const { knowledgeBase, retrievedCount } = await buildKnowledgeContext(
          request.user!.id,
          parsed.data.requirement,
          parsed.data.knowledgeBase,
          abort.signal
        );

        const epics = await generateStoriesServer(
          parsed.data.requirement,
          knowledgeBase,
          abort.signal
        );
        request.raw.off('close', onClose);
        const title = epics[0]?.epic || 'Untitled Plan';
        const insert = await query<{ id: string }>(
          `INSERT INTO generations (user_id, title, result_json)
           VALUES ($1, $2, $3::jsonb)
           RETURNING id`,
          [request.user!.id, title, JSON.stringify(epics)]
        );
        const generationId = insert.rows[0].id;
        const finishedAt = Date.now();
        await writeAudit(request.user!.id, 'generate', {
          generationId,
          epicCount: epics.length,
          retrievedChunkCount: retrievedCount,
          startedAt,
          durationMs: finishedAt - Date.parse(startedAt),
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

  app.post(
    '/api/generate/refine-story',
    { preHandler: [requireAuth, opts.generateLimit] },
    async (request, reply) => {
      const parsed = refineSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const epics = parsed.data.epics as Array<{
        epic: string;
        features: Array<{
          feature: string;
          user_stories: Array<{
            id: string;
            story: string;
            acceptance_criteria: string[];
            business_value: 'High' | 'Medium' | 'Low';
            risk_impact: 'High' | 'Medium' | 'Low';
            dependencies: string[];
            story_points?: 1 | 2 | 3 | 5 | 8 | 13;
          }>;
        }>;
      }>;

      const epic = epics[parsed.data.epicIndex];
      const feature = epic?.features[parsed.data.featureIndex];
      const story = feature?.user_stories.find((s) => s.id === parsed.data.storyId);
      if (!epic || !feature || !story) {
        return reply.code(400).send({ error: 'Story path not found in epics payload' });
      }

      try {
        const abort = new AbortController();
        const onClose = () => {
          if (!reply.sent) abort.abort();
        };
        request.raw.on('close', onClose);

        const refined = await refineStoryServer(
          {
            story: {
              ...story,
              story_points: story.story_points ?? 3,
            },
            instruction: parsed.data.instruction,
            epicTitle: epic.epic,
            featureTitle: feature.feature,
          },
          abort.signal
        );
        request.raw.off('close', onClose);

        const nextEpics = epics.map((e, ei) => {
          if (ei !== parsed.data.epicIndex) return e;
          return {
            ...e,
            features: e.features.map((f, fi) => {
              if (fi !== parsed.data.featureIndex) return f;
              return {
                ...f,
                user_stories: f.user_stories.map((s) =>
                  s.id === parsed.data.storyId ? { ...s, ...refined, id: s.id } : s
                ),
              };
            }),
          };
        });

        if (parsed.data.generationId) {
          await query(
            `UPDATE generations SET result_json = $1::jsonb
             WHERE id = $2 AND user_id = $3`,
            [JSON.stringify(nextEpics), parsed.data.generationId, request.user!.id]
          );
        }

        await writeAudit(request.user!.id, 'review.edit', {
          generationId: parsed.data.generationId ?? null,
          storyId: parsed.data.storyId,
          editKind: 'refine',
        });

        return { ok: true, story: refined, epics: nextEpics };
      } catch (err) {
        console.error(err);
        return reply.code(502).send({
          error: err instanceof Error ? err.message : 'Refine failed',
        });
      }
    }
  );
}
