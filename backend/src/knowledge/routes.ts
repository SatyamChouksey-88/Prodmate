import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/session.js';
import { writeAudit } from '../audit/log.js';
import { chunkText } from './chunk.js';
import { embedTexts } from '../services/embeddings.js';
import {
  deleteDocumentForUser,
  insertDocumentWithChunks,
  listDocumentsForUser,
} from './queries.js';

const ingestSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(500_000),
  sourceFilename: z.string().max(260).optional().nullable(),
});

export async function knowledgeRoutes(app: FastifyInstance) {
  app.get('/api/knowledge/documents', { preHandler: requireAuth }, async (request) => {
    const result = await listDocumentsForUser(request.user!.id);
    return {
      documents: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        sourceFilename: row.source_filename,
        createdAt: row.created_at,
        chunkCount: row.chunk_count,
      })),
    };
  });

  app.post('/api/knowledge/documents', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = ingestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const chunks = chunkText(parsed.data.content);
    if (!chunks.length) {
      return reply.code(400).send({ error: 'Document produced no chunks' });
    }
    if (chunks.length > 200) {
      return reply.code(400).send({ error: 'Document too large (max 200 chunks). Split and ingest separately.' });
    }

    try {
      const embeddings = await embedTexts(chunks);
      const { documentId, chunkCount } = await insertDocumentWithChunks(
        request.user!.id,
        parsed.data.title,
        parsed.data.sourceFilename ?? null,
        chunks.map((content, i) => ({ content, embedding: embeddings[i] }))
      );
      await writeAudit(request.user!.id, 'knowledge.ingest', {
        documentId,
        chunkCount,
        title: parsed.data.title,
      });
      return { documentId, chunkCount };
    } catch (err) {
      console.error(err);
      return reply.code(502).send({
        error: err instanceof Error ? err.message : 'Ingestion failed',
      });
    }
  });

  app.delete('/api/knowledge/documents/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await deleteDocumentForUser(request.user!.id, id);
    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Document not found' });
    }
    await writeAudit(request.user!.id, 'knowledge.delete', { documentId: id });
    return { ok: true };
  });
}
