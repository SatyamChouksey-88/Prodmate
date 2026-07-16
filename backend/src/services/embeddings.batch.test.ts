import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('embeddings batching', () => {
  it('uses Gemini batchEmbedContents via multi-content embedContent', () => {
    const src = readFileSync(join(dir, 'embeddings.ts'), 'utf8');
    expect(src).toMatch(/EMBED_BATCH_SIZE\s*=\s*100/);
    expect(src).toMatch(/batchEmbedContents/);
    expect(src).toMatch(/contents:\s*texts\.map\(truncate\)/);
    // No sequential per-text await loop
    expect(src).not.toMatch(/for \(const text of texts\)/);
  });
});
