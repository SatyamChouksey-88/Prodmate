import { describe, expect, it } from 'vitest';
import { buildStoryTaskBody } from '../../shared/trackers/clickUp';
import {
  PREVIEW_PARENT_TASK_ID,
  describeExportPlan,
} from './describeExportPlan';
import type { Epic } from '../../types';

const sample: Epic[] = [
  {
    epic: 'E1',
    epic_description: 'Epic desc',
    features: [
      {
        feature: 'F1',
        feature_description: 'Feat',
        user_stories: [
          {
            id: 'US1',
            story: 'As a user I want X',
            acceptance_criteria: ['a'],
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

describe('describeExportPlan (FE re-export)', () => {
  it('ClickUp tags line equals buildStoryTaskBody.tags for the same story input', () => {
    const story = sample[0].features[0].user_stories[0];
    const body = buildStoryTaskBody(
      story.story,
      {
        acceptanceCriteria: story.acceptance_criteria,
        businessValue: story.business_value,
        riskImpact: story.risk_impact,
        storyPoints: story.story_points,
      },
      PREVIEW_PARENT_TASK_ID
    );
    const lines = describeExportPlan('clickup', sample);
    const storyLine = lines.find((l) => l.kind === 'story');
    expect(storyLine?.fields).toContain(`tags: ${(body.tags as string[]).join(', ')}`);
  });

  it('includes story points mapping for ADO without creating items (hand-typed until shared-core)', () => {
    const lines = describeExportPlan('azure-devops', sample);
    expect(lines.some((l) => l.kind === 'epic')).toBe(true);
    expect(lines.some((l) => l.kind === 'feature')).toBe(true);
    const story = lines.find((l) => l.kind === 'story');
    expect(story?.fields.some((f) => /StoryPoints\/Effort/.test(f) && f.includes('3'))).toBe(
      true
    );
  });

  it('marks Jira features as virtual D8c (hand-typed until shared-core)', () => {
    const lines = describeExportPlan('jira', sample);
    const feature = lines.find((l) => l.kind === 'feature');
    expect(feature?.fields.some((f) => /Virtual \(D8c\)/.test(f))).toBe(true);
  });
});
