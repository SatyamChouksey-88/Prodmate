import { assertInsecureClientIntegrationsAllowed } from '../../config/runtimeFlags';
import type {
  ClickUpConfig,
  StoryDetails,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types';

const API_BASE = 'https://api.clickup.com/api/v2';
/** Demo-mode per-call ceiling (ms); API mode uses server TRACKER_FETCH_TIMEOUT_MS. */
const FETCH_TIMEOUT_MS = 30_000;

export const VALUE_RISK_TAGS = [
  'value:High',
  'value:Medium',
  'value:Low',
  'risk:High',
  'risk:Medium',
  'risk:Low',
] as const;

export type AdapterFetchOptions = {
  signal?: AbortSignal;
};

function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const timed = AbortSignal.timeout(ms);
  if (!parent) return timed;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parent, timed]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (parent.aborted || timed.aborted) {
    controller.abort();
    return controller.signal;
  }
  parent.addEventListener('abort', onAbort, { once: true });
  timed.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

async function clickUpFetch(
  url: string,
  options: RequestInit,
  parentSignal?: AbortSignal
): Promise<Response> {
  const signal = timeoutSignal(FETCH_TIMEOUT_MS, parentSignal);
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(
        `A network error occurred contacting ClickUp.\n\n` +
          `Browser-direct ClickUp calls may be blocked by CORS. Prefer API mode (VITE_API_URL) so the backend proxies server-to-server.`
      );
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

function storyMarkdown(details: StoryDetails): string | undefined {
  const parts: string[] = [];
  if (details.description?.trim()) parts.push(details.description.trim());
  if (details.acceptanceCriteria?.length) {
    parts.push('## Acceptance Criteria');
    for (const ac of details.acceptanceCriteria) {
      parts.push(`- ${ac}`);
    }
  }
  if (details.storyPoints != null) {
    parts.push(`Story points: ${details.storyPoints}`);
  }
  return parts.length ? parts.join('\n\n') : undefined;
}

export function createClickUpAdapter(
  config: ClickUpConfig,
  opts: AdapterFetchOptions = {}
): WorkItemTrackerAdapter {
  assertInsecureClientIntegrationsAllowed('ClickUp');

  const token = config.apiToken.trim();
  const spaceId = config.spaceId.trim();
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
      const existing = new Set(
        (listJson.tags ?? []).map((t) => t.name).filter(Boolean) as string[]
      );

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
        if (!createRes.ok && createRes.status !== 400) {
          let details = `Status ${createRes.status}`;
          try {
            details = JSON.stringify(await createRes.json());
          } catch {
            /* ignore */
          }
          throw new Error(`Failed to create ClickUp Space tag "${name}": ${details}`);
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
      assertInsecureClientIntegrationsAllowed('ClickUp connection test');
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
      if (description?.trim()) body.markdown_content = description.trim();

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
      if (description?.trim()) body.markdown_description = description.trim();
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
  };
}
