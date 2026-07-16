import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';

export type RateLimitPreHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void | FastifyReply>;

/**
 * Official @fastify/rate-limit — per authenticated user via keyGenerator.
 * In-memory store (single instance). Redis deferred for multi-instance deploys.
 */
export async function registerRateLimits(app: FastifyInstance): Promise<{
  generateLimit: RateLimitPreHandler;
  exportLimit: RateLimitPreHandler;
  knowledgeIngestLimit: RateLimitPreHandler;
}> {
  await app.register(rateLimit, { global: false });

  const checkGenerate = app.createRateLimit({
    max: config.rateLimitGenerateMax,
    timeWindow: '1 hour',
    keyGenerator: (request) => `generate:${request.user!.id}`,
  });

  const checkExport = app.createRateLimit({
    max: config.rateLimitExportMax,
    timeWindow: '1 hour',
    keyGenerator: (request) => `export:${request.user!.id}`,
  });

  const checkKnowledgeIngest = app.createRateLimit({
    max: config.rateLimitKnowledgeIngestMax,
    timeWindow: '1 hour',
    keyGenerator: (request) => `knowledge-ingest:${request.user!.id}`,
  });

  const generateLimit: RateLimitPreHandler = async (request, reply) => {
    const result = await checkGenerate(request);
    if (result.isAllowed === false && result.isExceeded) {
      return reply.code(429).send({
        error: `Generate rate limit exceeded (${config.rateLimitGenerateMax}/hour). Try again later.`,
        ttlMs: result.ttl,
      });
    }
  };

  const exportLimit: RateLimitPreHandler = async (request, reply) => {
    const result = await checkExport(request);
    if (result.isAllowed === false && result.isExceeded) {
      return reply.code(429).send({
        error: `Export rate limit exceeded (${config.rateLimitExportMax}/hour). Try again later.`,
        ttlMs: result.ttl,
      });
    }
  };

  const knowledgeIngestLimit: RateLimitPreHandler = async (request, reply) => {
    const result = await checkKnowledgeIngest(request);
    if (result.isAllowed === false && result.isExceeded) {
      return reply.code(429).send({
        error: `Knowledge ingest rate limit exceeded (${config.rateLimitKnowledgeIngestMax}/hour). Try again later.`,
        ttlMs: result.ttl,
      });
    }
  };

  return { generateLimit, exportLimit, knowledgeIngestLimit };
}
