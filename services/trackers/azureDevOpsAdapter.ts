import { assertInsecureClientIntegrationsAllowed } from '../../config/runtimeFlags';
import { escapeHtml } from '../../shared/htmlEscape';
import type {
  AzureDevOpsConfig,
  StoryDetails,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types';

async function adoFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(
        `A network error occurred, preventing connection to Azure DevOps.\n\n` +
          `This is most likely a CORS policy issue on your Azure DevOps organization. An administrator can resolve this by allowing this app's origin under 'Organization Settings > Policies > CORS'.\n\n` +
          `Other potential causes:\n` +
          `1. Incorrect Organization URL.\n` +
          `2. Network/VPN Issue preventing access to dev.azure.com.\n` +
          `3. A browser extension (like an ad-blocker) is blocking the request.`
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
  return 'Basic ' + btoa(':' + pat);
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
  details: StoryDetails & { description?: string }
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

  const response = await adoFetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(config.pat),
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(patchDocument),
  });

  if (!response.ok) {
    let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorDetails = errorData.message || JSON.stringify(errorData);
    } catch {
      /* ignore */
    }
    throw new Error(`Failed to create ${type} in ADO (Status: ${response.status}): ${errorDetails}`);
  }

  const result = await response.json();
  return { id: String(result.id), url: result.url };
}

export function createAzureDevOpsAdapter(config: AzureDevOpsConfig): WorkItemTrackerAdapter {
  assertInsecureClientIntegrationsAllowed('Azure DevOps');

  return {
    provider: 'azure-devops',

    async testConnection(): Promise<string> {
      assertInsecureClientIntegrationsAllowed('Azure DevOps connection test');
      const sanitizedOrgUrl = config.orgUrl.endsWith('/')
        ? config.orgUrl.slice(0, -1)
        : config.orgUrl;
      const apiUrl = `${sanitizedOrgUrl}/_apis/projects/${encodeURIComponent(config.project)}?api-version=7.1-preview.4`;

      const response = await adoFetch(apiUrl, {
        method: 'GET',
        headers: { Authorization: getAuthHeader(config.pat) },
      });

      if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.message || JSON.stringify(errorData);
        } catch {
          /* ignore */
        }
        throw new Error(
          `Connection test failed (Status: ${response.status}): ${errorDetails}. Please check your PAT and Project Name.`
        );
      }

      const result = await response.json();
      return `Successfully connected to project: "${result.name}"!`;
    },

    createEpic(title, description) {
      return createWorkItem(config, 'Epic', title, { description });
    },

    createFeature(title, description, _parentEpic) {
      return createWorkItem(config, 'Feature', title, { description });
    },

    createUserStory(title, details, _parent) {
      return createWorkItem(config, 'User Story', title, details);
    },

    async linkParent(child, parent) {
      const apiUrl = `${child.url}?api-version=7.1-preview.3`;
      const patchDocument = [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: parent.url,
            attributes: { comment: 'Parent' },
          },
        },
      ];

      const response = await adoFetch(apiUrl, {
        method: 'PATCH',
        headers: {
          Authorization: getAuthHeader(config.pat),
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(patchDocument),
      });

      if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.message || JSON.stringify(errorData);
        } catch {
          /* ignore */
        }
        throw new Error(`Failed to link child to parent (Status: ${response.status}): ${errorDetails}`);
      }
    },

    async linkDependency(from, dependsOn) {
      const apiUrl = `${from.url}?api-version=7.1-preview.3`;
      const patchDocument = [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'System.LinkTypes.Dependency',
            url: dependsOn.url,
            attributes: { comment: 'Depends on this story' },
          },
        },
      ];

      const response = await adoFetch(apiUrl, {
        method: 'PATCH',
        headers: {
          Authorization: getAuthHeader(config.pat),
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(patchDocument),
      });

      if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.message || JSON.stringify(errorData);
        } catch {
          /* ignore */
        }
        throw new Error(
          `Failed to link dependency to ${from.url} (Status: ${response.status}): ${errorDetails}`
        );
      }
    },
  };
}
