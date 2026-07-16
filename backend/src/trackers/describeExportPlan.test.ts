import { describe, expect, it } from 'vitest';
import { buildStoryTaskBody } from '../../../shared/trackers/clickUp.js';
import {
  PREVIEW_PARENT_TASK_ID,
  describeExportPlan,
  type EpicPayload,
} from './describeExportPlan.js';

const sample: EpicPayload[] = [
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
            acceptance_criteria: ['Must *escape*'],
            business_value: 'High',
            risk_impact: 'Low',
            dependencies: [],
            story_points: 5,
          },
        ],
      },
    ],
  },
];

describe('describeExportPlan (BE re-export)', () => {
  it('ClickUp preview tags and markdown match buildStoryTaskBody output', () => {
    const story = sample[0].features[0].user_stories[0];
    const details = {
      acceptanceCriteria: story.acceptance_criteria,
      businessValue: story.business_value,
      riskImpact: story.risk_impact,
      storyPoints: story.story_points,
    };
    const body = buildStoryTaskBody(story.story, details, PREVIEW_PARENT_TASK_ID);
    const lines = describeExportPlan('clickup', sample);
    const storyLine = lines.find((l) => l.kind === 'story');
    expect(storyLine?.fields).toContain(`tags: ${(body.tags as string[]).join(', ')}`);
    const mdField = storyLine?.fields.find((f) => f.startsWith('markdown_description: '));
    expect(mdField).toBeDefined();
    const preview = mdField!.slice('markdown_description: '.length);
    const full = String(body.markdown_description ?? '').trim();
    expect(preview.startsWith(full.slice(0, Math.min(120, full.length)))).toBe(true);
    expect(String(body.markdown_description)).toContain('\\*escape\\*');
  });
});
