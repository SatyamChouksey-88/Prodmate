import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { authRoutes } from './auth/routes.js';
import { generateRoutes } from './routes/generate.js';
import { exportRoutes } from './routes/export.js';
import { trackerSettingsRoutes } from './routes/trackerSettings.js';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  app.get('/api/health', async () => ({ ok: true, env: config.nodeEnv }));

  await authRoutes(app);
  await generateRoutes(app);
  await exportRoutes(app);
  await trackerSettingsRoutes(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`ProdMate backend listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
