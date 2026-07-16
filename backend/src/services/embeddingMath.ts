/** Pure embedding math helpers (no Gemini / config import). */

export const EMBEDDING_DIMENSIONS = 768;

export function l2Normalize(values: number[]): number[] {
  let sumSq = 0;
  for (const v of values) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (!norm || !Number.isFinite(norm)) return values.map(() => 0);
  return values.map((v) => v / norm);
}

export function toPgVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

/** Cosine similarity for L2-normalized vectors (dot product). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

