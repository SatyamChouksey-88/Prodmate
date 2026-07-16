import { escapeHtml } from '../../../shared/htmlEscape.js';
import { config as appConfig } from '../config.js';
import { timeoutSignal } from '../http/timeout.js';
import type {
  AzureDevOpsConfig,
  StoryDetails,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types.js';
import type { AdapterFetchOptions } from './adapterOptions.js';

async function adoFetch(
  url: string,
  options: RequestInit,
  parentSignal?: AbortSignal
): Promise<Response> {
  const signal = timeoutSignal(appConfig.trackerFetchTimeoutMs, parentSignal);
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Network error contacting Azure DevOps. Check Organization URL and network access.\n${String(error)}`
      );
    }
    throw error;
  }
}

function getApiBaseUrl(orgUrl: string, project: string) {
  const sanitizedOrgUrl = orgUrl.endsWith('/') ? orgUrl.slice(0, -1) : orgUrl;
  return `${sanitizedOrgUrl}/${encodeURIComponent(project)}/_apis/wit`;
}

function getAuthHeader(pat: string) {
  return 'Basic ' + Buffer.from(`:${pat}`, 'utf8').toString('base64');
}

function mapValueToPriority(value: 'High' | 'Medium' | 'Low'): number {
  switch (value) {
    case 'High':
      return 1;
    case 'Medium':
      return 2;
    case 'Low':
      return 3;
    default:
      return 2;
  }
}

async function createWorkItem(
  config: AzureDevOpsConfig,
  type: 'Epic' | 'Feature' | 'User Story',
  title: string,
  details: StoryDetails & { description?: string },
  parentSignal?: AbortSignal,
  storyPointsField?: string | null
): Promise<WorkItemRef> {
  const apiUrl = `${getApiBaseUrl(config.orgUrl, config.project)}/workitems/$${type}?api-version=7.1-preview.3`;

  const patchDocument: Array<{ op: string; path: string; value: unknown }> = [
    { op: 'add', path: '/fields/System.Title', value: title },
  ];

  let fullDescription = '';
  if (details.description) {
    fullDescription += `<p>${escapeHtml(details.description)}</p>`;
  }
  if (details.riskImpact) {
    fullDescription += `<br><b>Risk/Impact:</b> ${escapeHtml(details.riskImpact)}`;
  }

  if (fullDescription) {
    patchDocument.push({ op: 'add', path: '/fields/System.Description', value: fullDescription });
  }

  if (details.acceptanceCriteria) {
    const criteriaHtml = details.acceptanceCriteria
      .map((ac) => `<li>${escapeHtml(ac)}</li>`)
      .join('');
    patchDocument.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
      value: `<ul>${criteriaHtml}</ul>`,
    });
  }
  if (details.businessValue) {
    patchDocument.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: mapValueToPriority(details.businessValue),
    });
  }
  if (details.storyPoints != null && storyPointsField) {
    patchDocument.push({
      op: 'add',
      path: `/fields/${storyPointsField}`,
      value: details.storyPoints,
    });
  }

  const response = await adoFetch(
    apiUrl,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(config.pat),
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patchDocument),
    },
    parentSignal
  );

  if (!response.ok) {
    let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorDetails = (errorData as { message?: string }).message || JSON.stringify(errorData);
    } catch {
      /* ignore */
    }
    throw new Error(`Failed to create ${type} in ADO (Status: ${response.status}): ${errorDetails}`);
  }

  const result = (await response.json()) as { id: number; url: string };
  return { id: String(result.id), url: result.url };
}

const ADO_SP_PREFERRED = [
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
];

export function createAzureDevOpsAdapter(
  config: AzureDevOpsConfig,
  opts: AdapterFetchOptions = {}
): WorkItemTrackerAdapter {
  let storyPointsFieldPromise: Promise<string | null> | null = null;

  async function resolveStoryPointsField(): Promise<string | null> {
    if (!storyPointsFieldPromise) {
      storyPointsFieldPromise = (async () => {
        const apiUrl = `${getApiBaseUrl(config.orgUrl, config.project)}/workitemtypes/${encodeURIComponent('User Story')}/fields?api-version=7.1`;
        const response = await adoFetch(
          apiUrl,
          { method: 'GET', headers: { Authorization: getAuthHeader(config.pat) } },
          opts.signal
        );
        if (!response.ok) {
          console.warn(`ADO story-points field probe failed (${response.status}); skipping points.`);
          return null;
        }
        const fields = (await response.json()) as {
          value?: Array<{ referenceName?: string }>;
        };
        const names = new Set((fields.value ?? []).map((f) => f.referenceName).filter(Boolean));
        for (const candidate of ADO_SP_PREFERRED) {
          if (names.has(candidate)) return candidate;
        }
        console.warn('ADO project has no StoryPoints/Effort field on User Story; skipping points.');
        return null;
      })();
    }
    return storyPointsFieldPromise;
  }

  return {
    provider: 'azure-devops',

    async testConnection(): Promise<string> {
      const sanitizedOrgUrl = config.orgUrl.endsWith('/')
        ? config.orgUrl.slice(0, -1)
        : config.orgUrl;
      const apiUrl = `${sanitizedOrgUrl}/_apis/projects/${encodeURIComponent(config.project)}?api-version=7.1-preview.4`;

      const response = await adoFetch(
        apiUrl,
        {
          method: 'GET',
          headers: { Authorization: getAuthHeader(config.pat) },
        },
        opts.signal
      );

      if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = (errorData as { message?: string }).message || JSON.stringify(errorData);
        } catch {
          /* ignore */
        }
        throw new Error(`Connection test failed: ${errorDetails}`);
      }

      const result = (await response.json()) as { name: string };
      return `Successfully connected to project: "${result.name}"!`;
    },

    createEpic(title, description) {
      return createWorkItem(config, 'Epic', title, { description }, opts.signal, null);
    },

    createFeature(title, description) {
      return createWorkItem(config, 'Feature', title, { description }, opts.signal, null);
    },

    async createUserStory(title, details) {
      const spField = details.storyPoints != null ? await resolveStoryPointsField() : null;
      return createWorkItem(config, 'User Story', title, details, opts.signal, spField);
    },

    async linkParent(child, parent) {
      const apiUrl = `${child.url}?api-version=7.1-preview.3`;
      const response = await adoFetch(
        apiUrl,
        {
          method: 'PATCH',
          headers: {
            Authorization: getAuthHeader(config.pat),
            'Content-Type': 'application/json-patch+json',
          },
          body: JSON.stringify([
            {
              op: 'add',
              path: '/relations/-',
              value: {
                rel: 'System.LinkTypes.Hierarchy-Reverse',
                url: parent.url,
                attributes: { comment: 'Parent' },
              },
            },
          ]),
        },
        opts.signal
      );
      if (!response.ok) {
        throw new Error(`Failed to link child to parent (Status: ${response.status})`);
      }
    },

    async linkDependency(from, dependsOn) {
      const apiUrl = `${from.url}?api-version=7.1-preview.3`;
      const response = await adoFetch(
        apiUrl,
        {
          method: 'PATCH',
          headers: {
            Authorization: getAuthHeader(config.pat),
            'Content-Type': 'application/json-patch+json',
          },
          body: JSON.stringify([
            {
              op: 'add',
              path: '/relations/-',
              value: {
                rel: 'System.LinkTypes.Dependency',
                url: dependsOn.url,
                attributes: { comment: 'Depends on this story' },
              },
            },
          ]),
        },
        opts.signal
      );
      if (!response.ok) {
        throw new Error(`Failed to link dependency (Status: ${response.status})`);
      }
    },

    async listExistingItems(listOpts) {
      const limit = Math.min(Math.max(listOpts?.limit ?? 100, 1), 100);
      const wiqlUrl = `${getApiBaseUrl(config.orgUrl, config.project)}/wiql?$top=${limit}&api-version=7.1`;
      const wiql = {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${config.project.replace(/'/g, "''")}' AND [System.WorkItemType] IN ('User Story', 'Bug', 'Feature', 'Product Backlog Item') ORDER BY [System.ChangedDate] DESC`,
      };
      const wiqlRes = await adoFetch(
        wiqlUrl,
        {
          method: 'POST',
          headers: {
            Authorization: getAuthHeader(config.pat),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(wiql),
        },
        opts.signal
      );
      if (!wiqlRes.ok) {
        throw new Error(`ADO WIQL list failed (Status: ${wiqlRes.status})`);
      }
      const wiqlData = (await wiqlRes.json()) as {
        workItems?: Array<{ id: number }>;
      };
      const ids = (wiqlData.workItems ?? []).map((w) => w.id).slice(0, limit);
      if (!ids.length) return [];

      const batchUrl = `${getApiBaseUrl(config.orgUrl, config.project)}/workitemsbatch?api-version=7.1`;
      const batchRes = await adoFetch(
        batchUrl,
        {
          method: 'POST',
          headers: {
            Authorization: getAuthHeader(config.pat),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ids,
            fields: ['System.Id', 'System.Title', 'System.Description'],
          }),
        },
        opts.signal
      );
      if (!batchRes.ok) {
        throw new Error(`ADO work items batch failed (Status: ${batchRes.status})`);
      }
      const batch = (await batchRes.json()) as {
        value?: Array<{
          id: number;
          url?: string;
          fields?: Record<string, string>;
        }>;
      };
      return (batch.value ?? []).map((item) => ({
        id: String(item.id),
        title: item.fields?.['System.Title'] ?? `(#${item.id})`,
        description: item.fields?.['System.Description'],
        url: item.url ?? `${config.orgUrl}/_workitems/edit/${item.id}`,
      }));
    },
  };
}
