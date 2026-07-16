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
  parentSignal?: AbortSignal
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

export function createAzureDevOpsAdapter(
  config: AzureDevOpsConfig,
  opts: AdapterFetchOptions = {}
): WorkItemTrackerAdapter {
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
      return createWorkItem(config, 'Epic', title, { description }, opts.signal);
    },

    createFeature(title, description) {
      return createWorkItem(config, 'Feature', title, { description }, opts.signal);
    },

    createUserStory(title, details) {
      return createWorkItem(config, 'User Story', title, details, opts.signal);
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
  };
}
