/**
 * ClickUp adapter (D12): Epic→List, Feature→Task, Story→Subtask under a Space.
 * Auth: personal API token (pk_…) in Authorization header.
 * Value/risk: tags — ensured via Create Space Tag before first story create.
 */
import type { AdapterFetchOptions } from './adapterOptions.js';
import type {
  ClickUpConfig,
  StoryDetails,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types.js';
import { config as appConfig } from '../config.js';
import { timeoutSignal } from '../http/timeout.js';
import { escapeMarkdown } from '../../../shared/markdownEscape.js';

const API_BASE = 'https://api.clickup.com/api/v2';

export const VALUE_RISK_TAGS = [
  'value:High',
  'value:Medium',
  'value:Low',
  'risk:High',
  'risk:Medium',
  'risk:Low',
] as const;

async function clickUpFetch(
  url: string,
  options: RequestInit,
  parentSignal?: AbortSignal
): Promise<Response> {
  const signal = timeoutSignal(appConfig.trackerFetchTimeoutMs, parentSignal);
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error contacting ClickUp. Check connectivity.\n${String(error)}`);
    }
    throw error;
  }
}

function valueRiskTags(details: StoryDetails): string[] {
  const tags: string[] = [];
  if (details.businessValue) tags.push(`value:${details.businessValue}`);
  if (details.riskImpact) tags.push(`risk:${details.riskImpact}`);
  return tags;
}

/** Escape AI/user prose; keep intentional structure markers we add. */
function storyMarkdown(details: StoryDetails): string | undefined {
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

export function createClickUpAdapter(
  cfg: ClickUpConfig,
  opts: AdapterFetchOptions = {}
): WorkItemTrackerAdapter {
  const token = cfg.apiToken.trim();
  const spaceId = cfg.spaceId.trim();
  const headers = {
    Authorization: token,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let tagsReady: Promise<void> | null = null;

  async function ensureValueRiskTags(): Promise<void> {
    if (tagsReady) return tagsReady;
    tagsReady = (async () => {
      const listRes = await clickUpFetch(
        `${API_BASE}/space/${encodeURIComponent(spaceId)}/tag`,
        { method: 'GET', headers: { Authorization: token, Accept: 'application/json' } },
        opts.signal
      );
      if (!listRes.ok) {
        throw new Error(`Failed to list ClickUp Space tags (Status: ${listRes.status})`);
      }
      const listJson = (await listRes.json()) as { tags?: Array<{ name?: string }> };
      const existing = new Set((listJson.tags ?? []).map((t) => t.name).filter(Boolean) as string[]);

      for (const name of VALUE_RISK_TAGS) {
        if (existing.has(name)) continue;
        const createRes = await clickUpFetch(
          `${API_BASE}/space/${encodeURIComponent(spaceId)}/tag`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              tag: {
                name,
                tag_fg: '#ffffff',
                tag_bg: name.startsWith('value:') ? '#2563eb' : '#b45309',
              },
            }),
          },
          opts.signal
        );
        // Idempotent: treat conflict / already-exists as success
        if (!createRes.ok && createRes.status !== 400) {
          let details = `Status ${createRes.status}`;
          try {
            details = JSON.stringify(await createRes.json());
          } catch {
            /* ignore */
          }
          // Some tenants return 400 when the tag already exists under a race — skip those.
          if (createRes.status !== 400) {
            throw new Error(`Failed to create ClickUp Space tag "${name}": ${details}`);
          }
        }
      }
    })();
    return tagsReady;
  }

  async function createTaskInList(
    listId: string,
    body: Record<string, unknown>
  ): Promise<WorkItemRef> {
    const response = await clickUpFetch(
      `${API_BASE}/list/${encodeURIComponent(listId)}/task`,
      { method: 'POST', headers, body: JSON.stringify(body) },
      opts.signal
    );
    if (!response.ok) {
      let details = `Status ${response.status}`;
      try {
        details = JSON.stringify(await response.json());
      } catch {
        /* ignore */
      }
      throw new Error(`Failed to create ClickUp task: ${details}`);
    }
    const result = (await response.json()) as { id: string; url?: string };
    return {
      id: String(result.id),
      url: result.url || `https://app.clickup.com/t/${result.id}`,
      key: listId,
    };
  }

  return {
    provider: 'clickup',

    async testConnection(): Promise<string> {
      const response = await clickUpFetch(
        `${API_BASE}/space/${encodeURIComponent(spaceId)}`,
        { method: 'GET', headers: { Authorization: token, Accept: 'application/json' } },
        opts.signal
      );
      if (!response.ok) {
        throw new Error(`ClickUp connection test failed (Status: ${response.status})`);
      }
      await ensureValueRiskTags();
      const result = (await response.json()) as { name?: string; id?: string };
      return `Successfully connected to ClickUp Space: "${result.name ?? spaceId}" (${result.id ?? spaceId})!`;
    },

    async createEpic(title, description) {
      const body: Record<string, unknown> = { name: title };
      if (description?.trim()) body.markdown_content = escapeMarkdown(description.trim());

      const response = await clickUpFetch(
        `${API_BASE}/space/${encodeURIComponent(spaceId)}/list`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        opts.signal
      );
      if (!response.ok) {
        let details = `Status ${response.status}`;
        try {
          details = JSON.stringify(await response.json());
        } catch {
          /* ignore */
        }
        throw new Error(`Failed to create ClickUp List (Epic): ${details}`);
      }
      const result = (await response.json()) as { id: string };
      const listId = String(result.id);
      return {
        id: listId,
        url: `https://app.clickup.com/${spaceId}/v/li/${listId}`,
        key: listId,
      };
    },

    async createFeature(title, description, parentEpic) {
      const listId = parentEpic.id;
      const body: Record<string, unknown> = { name: title };
      if (description?.trim()) body.markdown_description = escapeMarkdown(description.trim());
      return createTaskInList(listId, body);
    },

    async createUserStory(title, details, parent) {
      await ensureValueRiskTags();
      const listId = parent.key || parent.id;
      const body: Record<string, unknown> = {
        name: title,
        parent: parent.id,
        tags: valueRiskTags(details),
      };
      const md = storyMarkdown(details);
      if (md) body.markdown_description = md;
      return createTaskInList(listId, body);
    },

    async linkParent() {
      /* List membership / parent set on create */
    },

    async linkDependency(from, dependsOn) {
      const response = await clickUpFetch(
        `${API_BASE}/task/${encodeURIComponent(from.id)}/dependency`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ depends_on: dependsOn.id }),
        },
        opts.signal
      );
      if (!response.ok) {
        throw new Error(`Failed to link ClickUp dependency (Status: ${response.status})`);
      }
    },

    async listExistingItems(listOpts) {
      const limit = Math.min(Math.max(listOpts?.limit ?? 100, 1), 100);
      // Resolve workspace (team) id from Space — required by Filtered Team Tasks.
      const spaceRes = await clickUpFetch(
        `${API_BASE}/space/${encodeURIComponent(spaceId)}`,
        { method: 'GET', headers },
        opts.signal
      );
      if (!spaceRes.ok) {
        throw new Error(`ClickUp get space failed (Status: ${spaceRes.status})`);
      }
      const space = (await spaceRes.json()) as { team_id?: string | number };
      const teamId = space.team_id != null ? String(space.team_id) : '';
      if (!teamId) {
        throw new Error('ClickUp space did not return team_id; cannot list backlog.');
      }

      const collected: Array<{
        id: string;
        name?: string;
        description?: string;
        markdown_description?: string;
        url?: string;
      }> = [];
      let page = 0;
      while (collected.length < limit) {
        const url =
          `${API_BASE}/team/${encodeURIComponent(teamId)}/task` +
          `?space_ids[]=${encodeURIComponent(spaceId)}` +
          `&order_by=updated&reverse=true&subtasks=true` +
          `&include_markdown_description=true&page=${page}`;
        const res = await clickUpFetch(url, { method: 'GET', headers }, opts.signal);
        if (!res.ok) {
          throw new Error(`ClickUp filtered tasks failed (Status: ${res.status})`);
        }
        const data = (await res.json()) as {
          tasks?: typeof collected;
          last_page?: boolean;
        };
        const tasks = data.tasks ?? [];
        if (!tasks.length) break;
        collected.push(...tasks);
        if (data.last_page || tasks.length === 0) break;
        page += 1;
        if (page > 20) break;
      }

      return collected.slice(0, limit).map((task) => ({
        id: String(task.id),
        title: task.name ?? task.id,
        description: task.markdown_description || task.description,
        url: task.url ?? `https://app.clickup.com/t/${task.id}`,
      }));
    },
  };
}
