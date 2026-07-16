import { describe, expect, it } from 'vitest';
import { cosineSimilarity, l2Normalize } from './embeddingMath.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical L2-normalized vectors', () => {
    const a = l2Normalize([1, 2, 3]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it('returns ~0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
});
