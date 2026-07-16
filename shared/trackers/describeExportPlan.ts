/**
 * Export preview — derive field lines from real per-provider builders where
 * shared-core extraction has landed (ClickUp). ADO / Jira remain hand-typed
 * fallbacks until their shared modules exist; do not treat all three as equally "real."
 */
import {
  buildEpicListBody,
  buildFeatureTaskBody,
  buildStoryTaskBody,
  type ClickUpStoryDetails,
} from './clickUp.js';

export type TrackerProvider = 'azure-devops' | 'jira' | 'clickup';

/** Minimal epic tree for preview (mirrors FE Epic / BE EpicPayload). */
export type PreviewEpic = {
  epic: string;
  epic_description: string;
  features: Array<{
    feature: string;
    feature_description: string;
    user_stories: Array<{
      id: string;
      story: string;
      acceptance_criteria: string[];
      business_value: 'High' | 'Medium' | 'Low';
      risk_impact: 'High' | 'Medium' | 'Low';
      dependencies: string[];
      story_points?: 1 | 2 | 3 | 5 | 8 | 13;
    }>;
  }>;
};

export type PreviewLine = {
  kind: 'epic' | 'feature' | 'story';
  title: string;
  parentHint?: string;
  fields: string[];
};

/** Placeholder parent id for preview-only story body builds (not sent to ClickUp). */
export const PREVIEW_PARENT_TASK_ID = 'preview-feature-task';

export function describeExportPlan(
  provider: TrackerProvider,
  epics: PreviewEpic[]
): PreviewLine[] {
  if (provider === 'clickup') {
    return describeClickUpPlan(epics);
  }
  // Hand-typed fallbacks — shared-core not landed yet (ADO Option A next; Jira ADF later).
  return describeHandTypedPlan(provider, epics);
}

function describeClickUpPlan(epics: PreviewEpic[]): PreviewLine[] {
  const lines: PreviewLine[] = [];

  for (const epic of epics) {
    const epicBody = buildEpicListBody(epic.epic, epic.epic_description);
    lines.push({
      kind: 'epic',
      title: epic.epic,
      fields: [
        'Create folderless List under Space',
        epicBody.markdown_content != null
          ? `markdown_content: ${truncate(String(epicBody.markdown_content))}`
          : 'markdown_content: (empty)',
      ],
    });

    for (const feature of epic.features) {
      const featureBody = buildFeatureTaskBody(
        feature.feature,
        feature.feature_description
      );
      lines.push({
        kind: 'feature',
        title: feature.feature,
        parentHint: `List "${epic.epic}"`,
        fields: [
          'Create Task in Epic List',
          featureBody.markdown_description != null
            ? `markdown_description: ${truncate(String(featureBody.markdown_description))}`
            : '',
        ].filter(Boolean),
      });

      for (const story of feature.user_stories) {
        const details: ClickUpStoryDetails = {
          acceptanceCriteria: story.acceptance_criteria,
          businessValue: story.business_value,
          riskImpact: story.risk_impact,
          storyPoints: story.story_points,
        };
        // Same mapping exportBacklog → createUserStory → buildStoryTaskBody uses.
        const storyBody = buildStoryTaskBody(
          story.story,
          details,
          PREVIEW_PARENT_TASK_ID
        );
        const tags = Array.isArray(storyBody.tags)
          ? (storyBody.tags as string[])
          : [];
        const fields: string[] = [
          'Create Subtask under Feature Task',
          `tags: ${tags.join(', ')}`,
        ];
        if (storyBody.markdown_description != null) {
          fields.push(
            `markdown_description: ${truncate(String(storyBody.markdown_description))}`
          );
        } else {
          fields.push('markdown_description: (empty)');
        }
        if (story.dependencies?.length) {
          fields.push(`dependency links → ${story.dependencies.join(', ')}`);
        }
        lines.push({
          kind: 'story',
          title: `${story.id}: ${truncate(story.story, 80)}`,
          parentHint: `Feature "${feature.feature}"`,
          fields,
        });
      }
    }
  }

  return lines;
}

/**
 * ADO + Jira: provisional hand-typed copy until shared/trackers/azureDevOps.ts
 * and Jira ADF shared-core land. Explicitly not builder-backed.
 */
function describeHandTypedPlan(
  provider: 'azure-devops' | 'jira',
  epics: PreviewEpic[]
): PreviewLine[] {
  const lines: PreviewLine[] = [];

  for (const epic of epics) {
    lines.push({
      kind: 'epic',
      title: epic.epic,
      fields: [
        'Create Epic work item',
        epic.epic_description
          ? `description: ${truncate(epic.epic_description)}`
          : 'description: (empty)',
      ],
    });

    for (const feature of epic.features) {
      if (provider === 'jira') {
        lines.push({
          kind: 'feature',
          title: feature.feature,
          parentHint: `Epic "${epic.epic}"`,
          fields: [
            'Virtual (D8c) — no mid-tier issue',
            `label feature:${slug(feature.feature)} on child stories`,
            feature.feature_description
              ? `noted in story description: ${truncate(feature.feature_description)}`
              : '',
          ].filter(Boolean),
        });
      } else {
        lines.push({
          kind: 'feature',
          title: feature.feature,
          parentHint: `Epic "${epic.epic}"`,
          fields: [
            'Create Feature work item + parent link',
            feature.feature_description
              ? `description: ${truncate(feature.feature_description)}`
              : '',
          ].filter(Boolean),
        });
      }

      for (const story of feature.user_stories) {
        const fields: string[] = [];
        if (provider === 'jira') {
          fields.push(`Issue type Story under Epic "${epic.epic}"`);
          fields.push(
            `labels: feature:…, value:${story.business_value}, risk:${story.risk_impact}`
          );
          fields.push(
            story.story_points != null
              ? `story points → resolved custom field (or skipped if unavailable): ${story.story_points}`
              : 'story points: (none)'
          );
        } else {
          fields.push('Create User Story + parent link to Feature');
          fields.push(`priority from business_value: ${story.business_value}`);
          fields.push(`risk in description: ${story.risk_impact}`);
          fields.push(
            story.story_points != null
              ? `StoryPoints/Effort field (probed): ${story.story_points}`
              : 'story points: (none)'
          );
        }
        if (story.dependencies?.length) {
          fields.push(`dependency links → ${story.dependencies.join(', ')}`);
        }
        lines.push({
          kind: 'story',
          title: `${story.id}: ${truncate(story.story, 80)}`,
          parentHint: `Feature "${feature.feature}"`,
          fields,
        });
      }
    }
  }

  return lines;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'untitled'
  );
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
