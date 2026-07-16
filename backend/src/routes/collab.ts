import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { query } from '../db/pool.js';
import { writeAudit } from '../audit/log.js';

async function assertOwnsGeneration(userId: string, generationId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM generations WHERE id = $1 AND user_id = $2`,
    [generationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function collabRoutes(app: FastifyInstance) {
  app.get(
    '/api/generations/:id/stories/:storyId/notes',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id, storyId } = request.params as { id: string; storyId: string };
      if (!(await assertOwnsGeneration(request.user!.id, id))) {
        return reply.code(404).send({ error: 'Generation not found' });
      }
      const rows = await query<{
        id: string;
        body: string;
        author_user_id: string;
        created_at: string;
      }>(
        `SELECT id, body, author_user_id, created_at::text
         FROM generation_story_notes
         WHERE generation_id = $1 AND story_id = $2
         ORDER BY created_at ASC`,
        [id, storyId]
      );
      return {
        notes: rows.rows.map((r) => ({
          id: r.id,
          body: r.body,
          authorUserId: r.author_user_id,
          createdAt: r.created_at,
        })),
      };
    }
  );

  app.post(
    '/api/generations/:id/stories/:storyId/notes',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id, storyId } = request.params as { id: string; storyId: string };
      const body = z.object({ body: z.string().min(1).max(4000) }).safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: body.error.flatten() });
      }
      if (!(await assertOwnsGeneration(request.user!.id, id))) {
        return reply.code(404).send({ error: 'Generation not found' });
      }
      const inserted = await query<{ id: string; created_at: string }>(
        `INSERT INTO generation_story_notes (generation_id, story_id, author_user_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at::text`,
        [id, storyId, request.user!.id, body.data.body]
      );
      return {
        note: {
          id: inserted.rows[0].id,
          body: body.data.body,
          authorUserId: request.user!.id,
          createdAt: inserted.rows[0].created_at,
        },
      };
    }
  );

  app.get(
    '/api/generations/:id/collab',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await assertOwnsGeneration(request.user!.id, id))) {
        return reply.code(404).send({ error: 'Generation not found' });
      }
      const rows = await query<{
        story_id: string;
        assignee_label: string | null;
        reviewed_at: string | null;
        reviewed_by_user_id: string | null;
      }>(
        `SELECT story_id, assignee_label, reviewed_at::text, reviewed_by_user_id
         FROM generation_story_collab WHERE generation_id = $1`,
        [id]
      );
      return {
        items: rows.rows.map((r) => ({
          storyId: r.story_id,
          assigneeLabel: r.assignee_label,
          reviewedAt: r.reviewed_at,
          reviewedByUserId: r.reviewed_by_user_id,
        })),
      };
    }
  );

  app.patch(
    '/api/generations/:id/stories/:storyId/collab',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id, storyId } = request.params as { id: string; storyId: string };
      const body = z
        .object({
          assigneeLabel: z.string().max(200).nullable().optional(),
          reviewed: z.boolean().optional(),
        })
        .safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: body.error.flatten() });
      }
      if (!(await assertOwnsGeneration(request.user!.id, id))) {
        return reply.code(404).send({ error: 'Generation not found' });
      }

      const existing = await query<{
        assignee_label: string | null;
        reviewed_at: string | null;
        reviewed_by_user_id: string | null;
      }>(
        `SELECT assignee_label, reviewed_at::text, reviewed_by_user_id
         FROM generation_story_collab WHERE generation_id = $1 AND story_id = $2`,
        [id, storyId]
      );

      let assignee =
        body.data.assigneeLabel !== undefined
          ? body.data.assigneeLabel
          : (existing.rows[0]?.assignee_label ?? null);
      let reviewedAt = existing.rows[0]?.reviewed_at ?? null;
      let reviewedBy = existing.rows[0]?.reviewed_by_user_id ?? null;

      if (body.data.reviewed === true) {
        reviewedAt = new Date().toISOString();
        reviewedBy = request.user!.id;
      } else if (body.data.reviewed === false) {
        reviewedAt = null;
        reviewedBy = null;
      }

      await query(
        `INSERT INTO generation_story_collab
           (generation_id, story_id, assignee_label, reviewed_at, reviewed_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (generation_id, story_id) DO UPDATE SET
           assignee_label = EXCLUDED.assignee_label,
           reviewed_at = EXCLUDED.reviewed_at,
           reviewed_by_user_id = EXCLUDED.reviewed_by_user_id`,
        [id, storyId, assignee, reviewedAt, reviewedBy]
      );

      await writeAudit(request.user!.id, 'collab.update', {
        generationId: id,
        storyId,
        assigneeLabel: assignee,
        reviewed: Boolean(reviewedAt),
      });

      return {
        item: {
          storyId,
          assigneeLabel: assignee,
          reviewedAt,
          reviewedByUserId: reviewedBy,
        },
      };
    }
  );
}
