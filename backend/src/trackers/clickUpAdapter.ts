/**
 * ClickUp adapter (D12): Epic→List, Feature→Task, Story→Subtask under a Space.
 * Auth: personal API token (pk_…) in Authorization header.
 * Value/risk: tags — ensured via Create Space Tag before first story create.
 * Pure mapping lives in shared/trackers/clickUp.ts.
 */
import type { AdapterFetchOptions } from './adapterOptions.js';
import type {
  ClickUpConfig,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types.js';
import { config as appConfig } from '../config.js';
import { timeoutSignal } from '../http/timeout.js';
import {
  CLICKUP_API_BASE,
  VALUE_RISK_TAGS,
  buildDependencyBody,
  buildEpicListBody,
  buildFeatureTaskBody,
  buildSpaceTagCreateBody,
  buildStoryTaskBody,
  clampBacklogLimit,
  clickUpListUrl,
  clickUpTaskUrl,
  filteredTeamTasksUrl,
  mapClickUpTaskToExistingItem,
} from '../../../shared/trackers/clickUp.js';

export { VALUE_RISK_TAGS };

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
        `${CLICKUP_API_BASE}/space/${encodeURIComponent(spaceId)}/tag`,
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
          `${CLICKUP_API_BASE}/space/${encodeURIComponent(spaceId)}/tag`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(buildSpaceTagCreateBody(name)),
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
      `${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}/task`,
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
      url: clickUpTaskUrl(String(result.id), result.url),
      key: listId,
    };
  }

  return {
    provider: 'clickup',

    async testConnection(): Promise<string> {
      const response = await clickUpFetch(
        `${CLICKUP_API_BASE}/space/${encodeURIComponent(spaceId)}`,
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
      const body = buildEpicListBody(title, description);
      const response = await clickUpFetch(
        `${CLICKUP_API_BASE}/space/${encodeURIComponent(spaceId)}/list`,
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
        url: clickUpListUrl(spaceId, listId),
        key: listId,
      };
    },

    async createFeature(title, description, parentEpic) {
      const listId = parentEpic.id;
      return createTaskInList(listId, buildFeatureTaskBody(title, description));
    },

    async createUserStory(title, details, parent) {
      await ensureValueRiskTags();
      const listId = parent.key || parent.id;
      return createTaskInList(listId, buildStoryTaskBody(title, details, parent.id));
    },

    async linkParent() {
      /* List membership / parent set on create */
    },

    async linkDependency(from, dependsOn) {
      const response = await clickUpFetch(
        `${CLICKUP_API_BASE}/task/${encodeURIComponent(from.id)}/dependency`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(buildDependencyBody(dependsOn.id)),
        },
        opts.signal
      );
      if (!response.ok) {
        throw new Error(`Failed to link ClickUp dependency (Status: ${response.status})`);
      }
    },

    async listExistingItems(listOpts) {
      const limit = clampBacklogLimit(listOpts?.limit);
      // Resolve workspace (team) id from Space — required by Filtered Team Tasks.
      const spaceRes = await clickUpFetch(
        `${CLICKUP_API_BASE}/space/${encodeURIComponent(spaceId)}`,
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
        const res = await clickUpFetch(
          filteredTeamTasksUrl(teamId, spaceId, page),
          { method: 'GET', headers },
          opts.signal
        );
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

      return collected.slice(0, limit).map(mapClickUpTaskToExistingItem);
    },
  };
}
