import { describe, expect, it } from 'vitest';
import {
  buildEpicListBody,
  buildFeatureTaskBody,
  buildStoryTaskBody,
} from './clickUp.js';
import {
  PREVIEW_PARENT_TASK_ID,
  describeExportPlan,
  type PreviewEpic,
} from './describeExportPlan.js';

const sample: PreviewEpic[] = [
  {
    epic: 'E1',
    epic_description: '# Epic heading',
    features: [
      {
        feature: 'F1',
        feature_description: 'Has [link](https://f.test)',
        user_stories: [
          {
            id: 'US1',
            story: 'As a user I want X',
            acceptance_criteria: ['Must handle *emphasis*', 'Open [link](https://x.test)'],
            business_value: 'High',
            risk_impact: 'Low',
            dependencies: ['US0'],
            story_points: 3,
          },
        ],
      },
    ],
  },
];

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

describe('describeExportPlan', () => {
  it('ClickUp story preview fields match buildStoryTaskBody for the same input', () => {
    const story = sample[0].features[0].user_stories[0];
    const details = {
      acceptanceCriteria: story.acceptance_criteria,
      businessValue: story.business_value,
      riskImpact: story.risk_impact,
      storyPoints: story.story_points,
    };
    const body = buildStoryTaskBody(story.story, details, PREVIEW_PARENT_TASK_ID);
    const tags = body.tags as string[];
    const md = String(body.markdown_description);

    const lines = describeExportPlan('clickup', sample);
    const storyLine = lines.find((l) => l.kind === 'story');
    expect(storyLine).toBeDefined();
    expect(tags).toEqual(['value:High', 'risk:Low']);
    expect(storyLine!.fields).toContain(`tags: ${tags.join(', ')}`);
    expect(storyLine!.fields).toContain(`markdown_description: ${truncate(md)}`);
  });

  it('ClickUp epic/feature preview derives from real list/task body builders', () => {
    const epic = sample[0];
    const feature = epic.features[0];
    const epicBody = buildEpicListBody(epic.epic, epic.epic_description);
    const featureBody = buildFeatureTaskBody(
      feature.feature,
      feature.feature_description
    );
    const lines = describeExportPlan('clickup', sample);
    const epicLine = lines.find((l) => l.kind === 'epic');
    const featureLine = lines.find((l) => l.kind === 'feature');
    expect(epicLine!.fields).toContain(
      `markdown_content: ${truncate(String(epicBody.markdown_content))}`
    );
    expect(featureLine!.fields).toContain(
      `markdown_description: ${truncate(String(featureBody.markdown_description))}`
    );
  });

  it('ADO/Jira remain hand-typed fallbacks (not builder-backed yet)', () => {
    const ado = describeExportPlan('azure-devops', sample);
    const story = ado.find((l) => l.kind === 'story');
    expect(story?.fields.some((f) => /StoryPoints\/Effort/.test(f) && f.includes('3'))).toBe(
      true
    );

    const jira = describeExportPlan('jira', sample);
    const feature = jira.find((l) => l.kind === 'feature');
    expect(feature?.fields.some((f) => /Virtual \(D8c\)/.test(f))).toBe(true);
  });
});
