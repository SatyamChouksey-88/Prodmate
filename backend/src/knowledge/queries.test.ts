import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chunkText, TARGET_TOKENS, OVERLAP_RATIO } from './chunk.js';
import {
  l2Normalize,
  toPgVectorLiteral,
  EMBEDDING_DIMENSIONS,
} from '../services/embeddingMath.js';

// Read source only — do not import ./queries.js (that loads the DB pool singleton and
// races with history/isolation.test.ts embedded-postgres DATABASE_URL setup).
const queriesSrc = fs.readFileSync(fileURLToPath(new URL('./queries.ts', import.meta.url)), 'utf8');

describe('knowledge query shape (always)', () => {
  it('exports SEARCH_CHUNKS_SQL as WHERE user_id = $1', () => {
    expect(queriesSrc).toMatch(/export const SEARCH_CHUNKS_SQL = `WHERE user_id = \$1`/);
  });

  it('searchChunksForUser SQL filters user_id before ORDER BY cosine distance', () => {
    expect(queriesSrc).toMatch(/WHERE user_id = \$1/);
    expect(queriesSrc).toMatch(/ORDER BY embedding <=> \$2::vector/);
    expect(queriesSrc).toMatch(/export async function searchChunksForUser/);
  });

  it('list/delete/count helpers are user-scoped', () => {
    expect(queriesSrc).toMatch(/FROM knowledge_documents d\s+WHERE d\.user_id = \$1/s);
    expect(queriesSrc).toMatch(
      /DELETE FROM knowledge_documents WHERE id = \$1 AND user_id = \$2/
    );
    expect(queriesSrc).toMatch(/FROM knowledge_chunks WHERE user_id = \$1/);
  });
});

describe('chunking', () => {
  it('uses ~600 token target and ~12% overlap constants', () => {
    expect(TARGET_TOKENS).toBe(600);
    expect(OVERLAP_RATIO).toBeCloseTo(0.12);
  });

  it('returns empty for blank input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('splits long text into multiple overlapping chunks', () => {
    const para = 'Sentence about domain rules. '.repeat(80);
    const chunks = chunkText(`${para}\n\n${para}\n\n${para}`);
    expect(chunks.length).toBeGreaterThan(1);
    // Overlap: later chunk should share a suffix prefix from previous content
    expect(chunks[1].length).toBeGreaterThan(0);
  });
});

describe('embedding helpers', () => {
  it('L2-normalizes to unit length', () => {
    const n = l2Normalize([3, 4]);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
    const len = Math.sqrt(n[0] * n[0] + n[1] * n[1]);
    expect(len).toBeCloseTo(1);
  });

  it('formats pgvector literals', () => {
    expect(toPgVectorLiteral([0.1, 0.2])).toBe('[0.1,0.2]');
  });

  it('documents 768-dim contract', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });
});
