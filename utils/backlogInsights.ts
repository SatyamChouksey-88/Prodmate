import type { Epic, StoryPoints, UserStory } from '../types';

/** Flattened story row for Insights summaries (epic/feature order preserved). */
export interface FlatStory {
  id: string;
  story: string;
  business_value: UserStory['business_value'];
  story_points?: StoryPoints;
}

export type InsightBucket = 'quickWins' | 'bigBets' | 'fillIns' | 'reconsider';

export const INSIGHT_BUCKET_ORDER: InsightBucket[] = [
  'quickWins',
  'bigBets',
  'fillIns',
  'reconsider',
];

export const INSIGHT_BUCKET_LABELS: Record<InsightBucket, string> = {
  quickWins: 'Quick wins',
  bigBets: 'Big bets',
  fillIns: 'Fill-ins',
  reconsider: 'Reconsider',
};

/** Low effort: points ≤ 3, or unsized (unsized ≠ high-effort). */
export function isLowEffort(points?: StoryPoints): boolean {
  return points == null || points <= 3;
}

export function flattenStories(epics: Epic[]): FlatStory[] {
  const out: FlatStory[] = [];
  for (const epic of epics) {
    for (const feature of epic.features) {
      for (const s of feature.user_stories) {
        out.push({
          id: s.id,
          story: s.story,
          business_value: s.business_value,
          story_points: s.story_points,
        });
      }
    }
  }
  return out;
}

export function bucketForStory(story: FlatStory): InsightBucket {
  const highValue = story.business_value === 'High';
  const lowEffort = isLowEffort(story.story_points);
  if (highValue && lowEffort) return 'quickWins';
  if (highValue && !lowEffort) return 'bigBets';
  if (!highValue && lowEffort) return 'fillIns';
  return 'reconsider';
}

export function bucketStories(epics: Epic[]): Record<InsightBucket, FlatStory[]> {
  const buckets: Record<InsightBucket, FlatStory[]> = {
    quickWins: [],
    bigBets: [],
    fillIns: [],
    reconsider: [],
  };
  for (const story of flattenStories(epics)) {
    buckets[bucketForStory(story)].push(story);
  }
  return buckets;
}

export interface SprintBin {
  /** 1-based sprint index */
  index: number;
  stories: FlatStory[];
  points: number;
}

export interface SprintPlan {
  sprints: SprintBin[];
  unsized: FlatStory[];
}

/**
 * Greedy bin-fill in existing flatten order. Unsized stories are excluded from
 * capacity math. Returns null when velocity is not a positive number.
 */
export function planSprints(stories: FlatStory[], velocity: number): SprintPlan | null {
  if (!Number.isFinite(velocity) || velocity <= 0) return null;

  const unsized: FlatStory[] = [];
  const sized: FlatStory[] = [];
  for (const s of stories) {
    if (s.story_points == null) unsized.push(s);
    else sized.push(s);
  }

  const sprints: SprintBin[] = [];
  let current: FlatStory[] = [];
  let currentPoints = 0;

  const flush = () => {
    if (current.length === 0) return;
    sprints.push({
      index: sprints.length + 1,
      stories: current,
      points: currentPoints,
    });
    current = [];
    currentPoints = 0;
  };

  for (const story of sized) {
    const pts = story.story_points as StoryPoints;
    if (current.length > 0 && currentPoints + pts > velocity) {
      flush();
    }
    current.push(story);
    currentPoints += pts;
  }
  flush();

  return { sprints, unsized };
}

export function truncateStoryText(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
