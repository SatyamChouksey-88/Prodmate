import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

describe('interaction rate limit (metrics + collab)', () => {
  it('registers interactionLimit with a shared per-user key', () => {
    const rateLimitSrc = readFileSync(join(root, 'rateLimit.ts'), 'utf8');
    expect(rateLimitSrc).toMatch(/interactionLimit/);
    expect(rateLimitSrc).toMatch(/interaction:\$\{request\.user!\.id\}/);
    expect(rateLimitSrc).toMatch(/rateLimitInteractionMax/);
  });

  it('config and .env.example expose RATE_LIMIT_INTERACTION_PER_HOUR (default 120)', () => {
    const configSrc = readFileSync(join(root, 'config.ts'), 'utf8');
    expect(configSrc).toMatch(/RATE_LIMIT_INTERACTION_PER_HOUR['"],\s*120\)/);
    const envExample = readFileSync(join(root, '../.env.example'), 'utf8');
    expect(envExample).toMatch(/RATE_LIMIT_INTERACTION_PER_HOUR=120/);
  });

  it('wires interactionLimit into metricsRoutes and collabRoutes from index', () => {
    const indexSrc = readFileSync(join(root, 'index.ts'), 'utf8');
    expect(indexSrc).toMatch(/interactionLimit/);
    expect(indexSrc).toMatch(/metricsRoutes\(app,\s*\{\s*interactionLimit/);
    expect(indexSrc).toMatch(/collabRoutes\(app,\s*\{\s*interactionLimit/);

    const metricsSrc = readFileSync(join(root, 'routes/metrics.ts'), 'utf8');
    expect(metricsSrc).toMatch(/interactionLimit/);
    expect(metricsSrc).toMatch(/preHandler:\s*gate/);

    const collabSrc = readFileSync(join(root, 'routes/collab.ts'), 'utf8');
    expect(collabSrc).toMatch(/interactionLimit/);
    expect(collabSrc).toMatch(/preHandler:\s*gate/);
  });
});

describe('expired session prune', () => {
  it('prune script deletes expired sessions and docs mention it', () => {
    const pruneSrc = readFileSync(join(root, '../scripts/prune-audit.ts'), 'utf8');
    expect(pruneSrc).toMatch(/DELETE FROM sessions WHERE expires_at < now\(\)/);

    const sessionSrc = readFileSync(join(root, 'auth/session.ts'), 'utf8');
    expect(sessionSrc).toMatch(/export async function pruneExpiredSessions/);
    expect(sessionSrc).toMatch(/DELETE FROM sessions WHERE expires_at < now\(\)/);

    const authSrc = readFileSync(join(root, 'auth/routes.ts'), 'utf8');
    expect(authSrc).toMatch(/pruneExpiredSessions/);

    const envExample = readFileSync(join(root, '../.env.example'), 'utf8');
    expect(envExample).toMatch(/expired sessions/i);

    const readme = readFileSync(join(root, '../README.md'), 'utf8');
    expect(readme).toMatch(/expires_at < now\(\)/);
  });
});
