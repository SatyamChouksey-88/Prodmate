import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { l2Normalize, EMBEDDING_DIMENSIONS } from './embeddingMath.js';
import { timeoutSignal } from '../http/timeout.js';

export { l2Normalize, toPgVectorLiteral, EMBEDDING_DIMENSIONS } from './embeddingMath.js';

/** D11: gemini-embedding-001 at 768 dims (manual L2-normalize required). */
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Gemini API `models.embedContent` maps to `batchEmbedContents` for the
 * developer API (see @google/genai embedContentInternal). Cap per call to
 * stay within documented batch request limits.
 * Docs: https://ai.google.dev/api/embeddings#method:-models.batchembedcontents
 */
export const EMBED_BATCH_SIZE = 100;

type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

function getClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

function truncate(text: string): string {
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

function normalizeEmbedding(values: number[] | undefined, label: string): number[] {
  if (!values?.length) {
    throw new Error(`${label} returned no values`);
  }
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${values.length}`
    );
  }
  return l2Normalize(Array.from(values));
}

/**
 * One batchEmbedContents round-trip for up to EMBED_BATCH_SIZE texts.
 * gemini-embedding-001 returns one embedding per input string (not aggregated).
 */
async function embedBatch(
  texts: string[],
  taskType: EmbedTaskType,
  parentSignal?: AbortSignal
): Promise<number[][]> {
  if (!texts.length) return [];
  if (texts.length > EMBED_BATCH_SIZE) {
    throw new Error(`embedBatch max is ${EMBED_BATCH_SIZE}, got ${texts.length}`);
  }

  const ai = getClient();
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts.map(truncate),
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType,
      abortSignal: timeoutSignal(config.embeddingTimeoutMs, parentSignal),
    },
  });

  const embeddings = result.embeddings;
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error(
      `Embedding batch size mismatch: sent ${texts.length}, got ${embeddings?.length ?? 0}`
    );
  }

  return embeddings.map((e, i) =>
    normalizeEmbedding(e.values, `Embedding[${i}]`)
  );
}

async function embedAll(
  texts: string[],
  taskType: EmbedTaskType,
  parentSignal?: AbortSignal
): Promise<number[][]> {
  if (!texts.length) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const chunk = texts.slice(i, i + EMBED_BATCH_SIZE);
    out.push(...(await embedBatch(chunk, taskType, parentSignal)));
  }
  return out;
}

/** Document embeddings (Knowledge Mesh ingest, backlog items). Batched. */
export async function embedTexts(
  texts: string[],
  parentSignal?: AbortSignal
): Promise<number[][]> {
  return embedAll(texts, 'RETRIEVAL_DOCUMENT', parentSignal);
}

/** Query embeddings for multiple texts in batch (backlog check stories). */
export async function embedQueries(
  texts: string[],
  parentSignal?: AbortSignal
): Promise<number[][]> {
  return embedAll(texts, 'RETRIEVAL_QUERY', parentSignal);
}

export async function embedQuery(text: string, parentSignal?: AbortSignal): Promise<number[]> {
  const [vec] = await embedQueries([text], parentSignal);
  if (!vec) throw new Error('Query embedding API returned no values');
  return vec;
}
