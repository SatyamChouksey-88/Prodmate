import type { Epic } from '../../types';
import type { TrackerProvider } from './types';

export type PreviewLine = {
  kind: 'epic' | 'feature' | 'story';
  title: string;
  parentHint?: string;
  fields: string[];
};

/**
 * Pure mapped preview of what exportBacklog will create — same field mapping
 * language as adapters (no tracker writes).
 */
export function describeExportPlan(provider: TrackerProvider, epics: Epic[]): PreviewLine[] {
  const lines: PreviewLine[] = [];

  for (const epic of epics) {
    lines.push({
      kind: 'epic',
      title: epic.epic,
      fields: [
        provider === 'clickup' ? 'Create folderless List under Space' : 'Create Epic work item',
        epic.epic_description ? `description: ${truncate(epic.epic_description)}` : 'description: (empty)',
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
      } else if (provider === 'clickup') {
        lines.push({
          kind: 'feature',
          title: feature.feature,
          parentHint: `List "${epic.epic}"`,
          fields: [
            'Create Task in Epic List',
            feature.feature_description
              ? `markdown_description: ${truncate(feature.feature_description)}`
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
          fields.push(`labels: feature:…, value:${story.business_value}, risk:${story.risk_impact}`);
          fields.push(
            story.story_points != null
              ? `story points → resolved custom field (or skipped if unavailable): ${story.story_points}`
              : 'story points: (none)'
          );
        } else if (provider === 'clickup') {
          fields.push('Create Subtask under Feature Task');
          fields.push(`tags: value:${story.business_value}, risk:${story.risk_impact}`);
          fields.push(
            story.story_points != null
              ? `description includes "Story points: ${story.story_points}"`
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'untitled';
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
