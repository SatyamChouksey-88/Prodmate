import { cosineSimilarity } from '../services/embeddingMath.js';
import { embedTexts, embedQueries } from '../services/embeddings.js';
import type { ExistingWorkItem } from '../trackers/types.js';

export const BACKLOG_LIST_LIMIT = 100;
export const DUPLICATE_SIMILARITY = 0.82;
export const RELATED_SIMILARITY = 0.7;

export type SimilarityKind = 'duplicate' | 'related';

export type StoryMatch = {
  storyId: string;
  storyText: string;
  kind: SimilarityKind;
  score: number;
  existing: ExistingWorkItem;
};

export type GeneratedStoryRef = {
  id: string;
  story: string;
};

function itemText(item: ExistingWorkItem): string {
  const desc = item.description?.trim() ?? '';
  return desc ? `${item.title}\n${desc}` : item.title;
}

/**
 * Ephemeral in-memory similarity — not Knowledge Mesh / pgvector.
 * Embeds up to BACKLOG_LIST_LIMIT existing items + generated stories via
 * Gemini batchEmbedContents (through SDK embedContent with string arrays).
 */
export async function findBacklogMatches(
  stories: GeneratedStoryRef[],
  existing: ExistingWorkItem[],
  parentSignal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<StoryMatch[]> {
  if (!stories.length || !existing.length) return [];

  const capped = existing.slice(0, BACKLOG_LIST_LIMIT);
  onProgress?.(
    `Embedding ${capped.length} backlog item${capped.length === 1 ? '' : 's'}…`
  );
  const backlogVectors = await embedTexts(capped.map(itemText), parentSignal);

  onProgress?.(
    `Embedding ${stories.length} generated stor${stories.length === 1 ? 'y' : 'ies'}…`
  );
  const storyVectors = await embedQueries(
    stories.map((s) => s.story),
    parentSignal
  );

  onProgress?.('Computing similarity…');
  const matches: StoryMatch[] = [];

  for (let s = 0; s < stories.length; s++) {
    const story = stories[s]!;
    const queryVec = storyVectors[s]!;
    let best: { score: number; item: ExistingWorkItem } | null = null;
    for (let i = 0; i < capped.length; i++) {
      const score = cosineSimilarity(queryVec, backlogVectors[i]!);
      if (!best || score > best.score) {
        best = { score, item: capped[i]! };
      }
    }
    if (!best) continue;
    if (best.score >= DUPLICATE_SIMILARITY) {
      matches.push({
        storyId: story.id,
        storyText: story.story,
        kind: 'duplicate',
        score: best.score,
        existing: best.item,
      });
    } else if (best.score >= RELATED_SIMILARITY) {
      matches.push({
        storyId: story.id,
        storyText: story.story,
        kind: 'related',
        score: best.score,
        existing: best.item,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  onProgress?.(`Done — ${matches.length} match${matches.length === 1 ? '' : 'es'}.`);
  return matches;
}
