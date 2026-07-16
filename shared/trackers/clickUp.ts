/**
 * ClickUp adapter-core — pure mapping / request-body builders only.
 * FE and BE adapters own fetch, timeouts, CORS, and assertInsecure.
 */
import { escapeMarkdown } from '../markdownEscape.js';

export const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export const VALUE_RISK_TAGS = [
  'value:High',
  'value:Medium',
  'value:Low',
  'risk:High',
  'risk:Medium',
  'risk:Low',
] as const;

/** Minimal story fields needed for ClickUp body builders (mirrors StoryDetails). */
export type ClickUpStoryDetails = {
  description?: string;
  acceptanceCriteria?: string[];
  businessValue?: 'High' | 'Medium' | 'Low';
  riskImpact?: 'High' | 'Medium' | 'Low';
  storyPoints?: 1 | 2 | 3 | 5 | 8 | 13;
};

export type ClickUpTaskPayload = {
  id: string;
  name?: string;
  description?: string;
  markdown_description?: string;
  url?: string;
};

export function valueRiskTags(details: ClickUpStoryDetails): string[] {
  const tags: string[] = [];
  if (details.businessValue) tags.push(`value:${details.businessValue}`);
  if (details.riskImpact) tags.push(`risk:${details.riskImpact}`);
  return tags;
}

/** Escape AI/user prose; keep intentional structure markers we add. */
export function storyMarkdown(details: ClickUpStoryDetails): string | undefined {
  const parts: string[] = [];
  if (details.description?.trim()) parts.push(escapeMarkdown(details.description.trim()));
  if (details.acceptanceCriteria?.length) {
    parts.push('## Acceptance Criteria');
    for (const ac of details.acceptanceCriteria) {
      parts.push(`- ${escapeMarkdown(ac)}`);
    }
  }
  if (details.storyPoints != null) {
    parts.push(`Story points: ${details.storyPoints}`);
  }
  return parts.length ? parts.join('\n\n') : undefined;
}

/** POST /space/{id}/list body (Epic → List). */
export function buildEpicListBody(
  title: string,
  description?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { name: title };
  if (description?.trim()) body.markdown_content = escapeMarkdown(description.trim());
  return body;
}

/** POST /list/{id}/task body for a Feature (top-level task). */
export function buildFeatureTaskBody(
  title: string,
  description?: string
): Record<string, unknown> {
  const body: Record<string, unknown> = { name: title };
  if (description?.trim()) body.markdown_description = escapeMarkdown(description.trim());
  return body;
}

/** POST /list/{id}/task body for a Story (subtask under feature). */
export function buildStoryTaskBody(
  title: string,
  details: ClickUpStoryDetails,
  parentTaskId: string
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: title,
    parent: parentTaskId,
    tags: valueRiskTags(details),
  };
  const md = storyMarkdown(details);
  if (md) body.markdown_description = md;
  return body;
}

/** POST /space/{id}/tag body for one value/risk tag. */
export function buildSpaceTagCreateBody(name: string): Record<string, unknown> {
  return {
    tag: {
      name,
      tag_fg: '#ffffff',
      tag_bg: name.startsWith('value:') ? '#2563eb' : '#b45309',
    },
  };
}

export function buildDependencyBody(dependsOnId: string): Record<string, unknown> {
  return { depends_on: dependsOnId };
}

export function clickUpTaskUrl(taskId: string, urlFromApi?: string): string {
  return urlFromApi || `https://app.clickup.com/t/${taskId}`;
}

export function clickUpListUrl(spaceId: string, listId: string): string {
  return `https://app.clickup.com/${spaceId}/v/li/${listId}`;
}

export function clampBacklogLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 100, 1), 100);
}

export function mapClickUpTaskToExistingItem(task: ClickUpTaskPayload): {
  id: string;
  title: string;
  description?: string;
  url: string;
} {
  const id = String(task.id);
  return {
    id,
    title: task.name ?? id,
    description: task.markdown_description || task.description,
    url: clickUpTaskUrl(id, task.url),
  };
}

export function filteredTeamTasksUrl(
  teamId: string,
  spaceId: string,
  page: number
): string {
  return (
    `${CLICKUP_API_BASE}/team/${encodeURIComponent(teamId)}/task` +
    `?space_ids[]=${encodeURIComponent(spaceId)}` +
    `&order_by=updated&reverse=true&subtasks=true` +
    `&include_markdown_description=true&page=${page}`
  );
}
