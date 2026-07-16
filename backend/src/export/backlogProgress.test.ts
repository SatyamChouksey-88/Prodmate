import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('backlog-matches NDJSON progress', () => {
  it('findBacklogMatches accepts onProgress and batches story embeds', () => {
    const src = readFileSync(join(root, 'export/backlogSimilarity.ts'), 'utf8');
    expect(src).toMatch(/onProgress\?:/);
    expect(src).toMatch(/embedQueries/);
    expect(src).not.toMatch(/for \(const story of stories\)[\s\S]*embedQuery/);
  });

  it('route streams application/x-ndjson progress events', () => {
    const src = readFileSync(join(root, 'routes/export.ts'), 'utf8');
    expect(src).toMatch(/BacklogNdjsonEvent/);
    expect(src).toMatch(
      /backlog-matches[\s\S]*application\/x-ndjson/
    );
    expect(src).toMatch(/type: 'progress'/);
  });
});
