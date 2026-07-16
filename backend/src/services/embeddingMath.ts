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
