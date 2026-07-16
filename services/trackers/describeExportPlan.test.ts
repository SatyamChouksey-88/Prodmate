import { describe, expect, it } from 'vitest';
import { describeExportPlan } from './describeExportPlan';
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

describe('describeExportPlan', () => {
  it('includes story points mapping for ADO without creating items', () => {
    const lines = describeExportPlan('azure-devops', sample);
    expect(lines.some((l) => l.kind === 'epic')).toBe(true);
    expect(lines.some((l) => l.kind === 'feature')).toBe(true);
    const story = lines.find((l) => l.kind === 'story');
    expect(story?.fields.some((f) => /StoryPoints\/Effort/.test(f) && f.includes('3'))).toBe(true);
  });

  it('marks Jira features as virtual D8c', () => {
    const lines = describeExportPlan('jira', sample);
    const feature = lines.find((l) => l.kind === 'feature');
    expect(feature?.fields.some((f) => /Virtual \(D8c\)/.test(f))).toBe(true);
  });
});
