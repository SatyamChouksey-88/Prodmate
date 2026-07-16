import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

describe('backlog-check rate limit', () => {
  it('registers a dedicated limit separate from exportLimit', () => {
    const rateLimitSrc = readFileSync(join(root, 'rateLimit.ts'), 'utf8');
    expect(rateLimitSrc).toMatch(/backlogCheckLimit/);
    expect(rateLimitSrc).toMatch(/backlog-check:\$\{request\.user!\.id\}/);
    expect(rateLimitSrc).toMatch(/rateLimitBacklogCheckMax/);
  });

  it('config and .env.example expose RATE_LIMIT_BACKLOG_CHECK_PER_HOUR (default 10)', () => {
    const configSrc = readFileSync(join(root, 'config.ts'), 'utf8');
    expect(configSrc).toMatch(
      /RATE_LIMIT_BACKLOG_CHECK_PER_HOUR['"],\s*10\)/
    );
    const envExample = readFileSync(join(root, '../.env.example'), 'utf8');
    expect(envExample).toMatch(/RATE_LIMIT_BACKLOG_CHECK_PER_HOUR=10/);
  });

  it('wires backlogCheckLimit onto POST /api/export/backlog-matches only', () => {
    const exportSrc = readFileSync(join(root, 'routes/export.ts'), 'utf8');
    expect(exportSrc).toMatch(
      /['"]\/api\/export\/backlog-matches['"][\s\S]*?backlogCheckLimit/
    );
    // Live export still uses exportLimit
    expect(exportSrc).toMatch(
      /['"]\/api\/export['"][\s\S]*?exportLimit/
    );
    const indexSrc = readFileSync(join(root, 'index.ts'), 'utf8');
    expect(indexSrc).toMatch(/backlogCheckLimit/);
  });
});
