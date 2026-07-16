import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { l2Normalize, EMBEDDING_DIMENSIONS } from './embeddingMath.js';
import { timeoutSignal } from '../http/timeout.js';

export { l2Normalize, toPgVectorLiteral, EMBEDDING_DIMENSIONS } from './embeddingMath.js';

/** D11: gemini-embedding-001 at 768 dims (manual L2-normalize required). */
export const EMBEDDING_MODEL = 'gemini-embedding-001';

function getClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

export async function embedTexts(
  texts: string[],
  parentSignal?: AbortSignal
): Promise<number[][]> {
  if (!texts.length) return [];
  const ai = getClient();
  const out: number[][] = [];

  for (const text of texts) {
    const truncated = text.length > 8000 ? text.slice(0, 8000) : text;
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: truncated,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: 'RETRIEVAL_DOCUMENT',
        abortSignal: timeoutSignal(config.embeddingTimeoutMs, parentSignal),
      },
    });
    const values = result.embeddings?.[0]?.values;
    if (!values?.length) {
      throw new Error('Embedding API returned no values');
    }
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${values.length}`
      );
    }
    out.push(l2Normalize(Array.from(values)));
  }
  return out;
}

export async function embedQuery(text: string, parentSignal?: AbortSignal): Promise<number[]> {
  const ai = getClient();
  const truncated = text.length > 8000 ? text.slice(0, 8000) : text;
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: truncated,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: 'RETRIEVAL_QUERY',
      abortSignal: timeoutSignal(config.embeddingTimeoutMs, parentSignal),
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values?.length) {
    throw new Error('Query embedding API returned no values');
  }
  return l2Normalize(Array.from(values));
}
