import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { authRoutes } from './auth/routes.js';
import { generateRoutes } from './routes/generate.js';
import { exportRoutes } from './routes/export.js';
import { trackerSettingsRoutes } from './routes/trackerSettings.js';
import { historyRoutes } from './routes/history.js';
import { knowledgeRoutes } from './knowledge/routes.js';
import { registerRateLimits } from './rateLimit.js';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  // Monitoring option A: structured access + error logs (no new infra).
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        type: 'http_access',
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
        userId: request.user?.id ?? null,
      },
      'request completed'
    );
  });

  app.addHook('onError', async (request, _reply, error) => {
    request.log.error(
      {
        type: 'http_error',
        method: request.method,
        url: request.url,
        err: error,
        userId: request.user?.id ?? null,
      },
      'request error'
    );
  });

  app.get('/api/health', async () => ({ ok: true, env: config.nodeEnv }));

  const { generateLimit, exportLimit } = await registerRateLimits(app);

  await authRoutes(app);
  await generateRoutes(app, { generateLimit });
  await exportRoutes(app, { exportLimit });
  await trackerSettingsRoutes(app);
  await historyRoutes(app);
  await knowledgeRoutes(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`ProdMate backend listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
