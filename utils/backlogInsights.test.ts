import { describe, expect, it } from 'vitest';
import type { Epic } from '../types';
import {
  bucketForStory,
  bucketStories,
  flattenStories,
  isLowEffort,
  planSprints,
  truncateStoryText,
  type FlatStory,
} from './backlogInsights';

const sample: Epic[] = [
  {
    epic: 'E1',
    epic_description: '',
    features: [
      {
        feature: 'F1',
        feature_description: '',
        user_stories: [
          {
            id: 'S1',
            story: 'High value small',
            acceptance_criteria: [],
            business_value: 'High',
            risk_impact: 'Low',
            dependencies: [],
            story_points: 2,
          },
          {
            id: 'S2',
            story: 'High value large',
            acceptance_criteria: [],
            business_value: 'High',
            risk_impact: 'Medium',
            dependencies: [],
            story_points: 8,
          },
          {
            id: 'S3',
            story: 'Medium unsized',
            acceptance_criteria: [],
            business_value: 'Medium',
            risk_impact: 'Low',
            dependencies: [],
          },
          {
            id: 'S4',
            story: 'Low value heavy',
            acceptance_criteria: [],
            business_value: 'Low',
            risk_impact: 'High',
            dependencies: [],
            story_points: 5,
          },
          {
            id: 'S5',
            story: 'High value boundary three',
            acceptance_criteria: [],
            business_value: 'High',
            risk_impact: 'Low',
            dependencies: [],
            story_points: 3,
          },
        ],
      },
    ],
  },
];

describe('isLowEffort', () => {
  it('treats unsized and ≤3 as low effort; ≥5 as high', () => {
    expect(isLowEffort(undefined)).toBe(true);
    expect(isLowEffort(1)).toBe(true);
    expect(isLowEffort(3)).toBe(true);
    expect(isLowEffort(5)).toBe(false);
    expect(isLowEffort(13)).toBe(false);
  });
});

describe('bucketForStory / bucketStories', () => {
  it('maps the four quadrants from value × effort', () => {
    expect(
      bucketForStory({
        id: 'a',
        story: '',
        business_value: 'High',
        story_points: 2,
      })
    ).toBe('quickWins');
    expect(
      bucketForStory({
        id: 'b',
        story: '',
        business_value: 'High',
        story_points: 5,
      })
    ).toBe('bigBets');
    expect(
      bucketForStory({
        id: 'c',
        story: '',
        business_value: 'Medium',
        story_points: 1,
      })
    ).toBe('fillIns');
    expect(
      bucketForStory({
        id: 'd',
        story: '',
        business_value: 'Low',
        story_points: 8,
      })
    ).toBe('reconsider');
  });

  it('puts unsized stories in low-effort buckets (not high-effort)', () => {
    expect(
      bucketForStory({
        id: 'u',
        story: '',
        business_value: 'High',
      })
    ).toBe('quickWins');
    expect(
      bucketForStory({
        id: 'u2',
        story: '',
        business_value: 'Low',
      })
    ).toBe('fillIns');
  });

  it('buckets the whole backlog preserving flatten order within cells', () => {
    const buckets = bucketStories(sample);
    expect(buckets.quickWins.map((s) => s.id)).toEqual(['S1', 'S5']);
    expect(buckets.bigBets.map((s) => s.id)).toEqual(['S2']);
    expect(buckets.fillIns.map((s) => s.id)).toEqual(['S3']);
    expect(buckets.reconsider.map((s) => s.id)).toEqual(['S4']);
  });
});

describe('flattenStories', () => {
  it('walks epic → feature → story order', () => {
    expect(flattenStories(sample).map((s) => s.id)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
    ]);
  });
});

describe('planSprints', () => {
  const stories: FlatStory[] = [
    { id: 'A', story: 'a', business_value: 'High', story_points: 3 },
    { id: 'B', story: 'b', business_value: 'High', story_points: 2 },
    { id: 'C', story: 'c', business_value: 'Low', story_points: 5 },
    { id: 'D', story: 'd', business_value: 'Medium' },
    { id: 'E', story: 'e', business_value: 'High', story_points: 1 },
  ];

  it('returns null for empty/zero/negative velocity', () => {
    expect(planSprints(stories, 0)).toBeNull();
    expect(planSprints(stories, -1)).toBeNull();
    expect(planSprints(stories, Number.NaN)).toBeNull();
  });

  it('greedily fills sprints and lists unsized separately', () => {
    const plan = planSprints(stories, 5);
    expect(plan).not.toBeNull();
    expect(plan!.unsized.map((s) => s.id)).toEqual(['D']);
    // Sprint 1: A(3)+B(2)=5; Sprint 2: C(5)=5; Sprint 3: E(1)=1
    expect(plan!.sprints).toEqual([
      { index: 1, stories: [stories[0], stories[1]], points: 5 },
      { index: 2, stories: [stories[2]], points: 5 },
      { index: 3, stories: [stories[4]], points: 1 },
    ]);
  });

  it('places an oversized story alone in the next sprint', () => {
    const oversized: FlatStory[] = [
      { id: 'x', story: 'x', business_value: 'High', story_points: 3 },
      { id: 'y', story: 'y', business_value: 'High', story_points: 8 },
    ];
    const plan = planSprints(oversized, 5);
    expect(plan!.sprints.map((s) => ({ ids: s.stories.map((t) => t.id), points: s.points }))).toEqual([
      { ids: ['x'], points: 3 },
      { ids: ['y'], points: 8 },
    ]);
  });
});

describe('truncateStoryText', () => {
  it('shortens long prose with an ellipsis', () => {
    const long = 'a'.repeat(100);
    expect(truncateStoryText(long, 80)).toHaveLength(80);
    expect(truncateStoryText(long, 80).endsWith('…')).toBe(true);
    expect(truncateStoryText('short')).toBe('short');
  });
});
