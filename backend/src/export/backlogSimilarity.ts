import { cosineSimilarity } from '../services/embeddingMath.js';
import { embedTexts, embedQuery } from '../services/embeddings.js';
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
 * Embeds up to BACKLOG_LIST_LIMIT existing items + each generated story.
 */
export async function findBacklogMatches(
  stories: GeneratedStoryRef[],
  existing: ExistingWorkItem[],
  parentSignal?: AbortSignal
): Promise<StoryMatch[]> {
  if (!stories.length || !existing.length) return [];

  const capped = existing.slice(0, BACKLOG_LIST_LIMIT);
  const backlogVectors = await embedTexts(
    capped.map(itemText),
    parentSignal
  );

  const matches: StoryMatch[] = [];

  for (const story of stories) {
    const queryVec = await embedQuery(story.story, parentSignal);
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
  return matches;
}
