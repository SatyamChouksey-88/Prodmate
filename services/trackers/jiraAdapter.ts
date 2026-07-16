import { assertInsecureClientIntegrationsAllowed } from '../../config/runtimeFlags';
import type {
  JiraConfig,
  StoryDetails,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types';

/** Atlassian Document Format paragraph helper (Jira Cloud REST API v3). */
function toAdf(text: string) {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  return {
    type: 'doc',
    version: 1,
    content: (paragraphs.length ? paragraphs : ['']).map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}

function slugLabel(prefix: string, value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${prefix}:${slug || 'untitled'}`;
}

function valueLabel(value: 'High' | 'Medium' | 'Low'): string {
  return `value:${value}`;
}

function riskLabel(value: 'High' | 'Medium' | 'Low'): string {
  return `risk:${value}`;
}

async function jiraFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error(
        `A network error occurred contacting Jira.\n\n` +
          `Browser-direct Jira calls may be blocked by CORS. Phase 3 backend will proxy these server-to-server.\n\n` +
          `Other causes: wrong base URL, network/VPN, or a browser extension blocking the request.`
      );
    }
    throw error;
  }
}

function getAuthHeader(email: string, apiToken: string) {
  return 'Basic ' + btoa(`${email}:${apiToken}`);
}

function sanitizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createJiraAdapter(config: JiraConfig): WorkItemTrackerAdapter {
  assertInsecureClientIntegrationsAllowed('Jira');

  const base = sanitizeBaseUrl(config.baseUrl);
  const storyType = config.storyIssueType?.trim() || 'Story';
  const auth = getAuthHeader(config.email, config.apiToken);

  async function createIssue(fields: Record<string, unknown>): Promise<WorkItemRef> {
    const response = await jiraFetch(`${base}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorDetails =
          errorData.errorMessages?.join('; ') ||
          JSON.stringify(errorData.errors || errorData);
      } catch {
        /* ignore */
      }
      throw new Error(`Failed to create Jira issue (Status: ${response.status}): ${errorDetails}`);
    }

    const result = await response.json();
    const key = result.key as string;
    return {
      id: String(result.id),
      key,
      url: `${base}/browse/${key}`,
    };
  }

  return {
    provider: 'jira',

    async testConnection(): Promise<string> {
      assertInsecureClientIntegrationsAllowed('Jira connection test');
      const response = await jiraFetch(
        `${base}/rest/api/3/project/${encodeURIComponent(config.projectKey)}`,
        {
          method: 'GET',
          headers: { Authorization: auth, Accept: 'application/json' },
        }
      );

      if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails =
            errorData.errorMessages?.join('; ') ||
            JSON.stringify(errorData.errors || errorData);
        } catch {
          /* ignore */
        }
        throw new Error(
          `Connection test failed (Status: ${response.status}): ${errorDetails}. Check base URL, project key, email, and API token.`
        );
      }

      const result = await response.json();
      return `Successfully connected to Jira project: "${result.name}" (${result.key})!`;
    },

    async createEpic(title, description) {
      const fields: Record<string, unknown> = {
        project: { key: config.projectKey },
        summary: title,
        issuetype: { name: 'Epic' },
      };
      if (description) {
        fields.description = toAdf(description);
      }
      return createIssue(fields);
    },

    /**
     * D8(c): no mid-level Feature issue — return a virtual ref so stories
     * get a feature:* label and parent Epic via the parent field.
     */
    async createFeature(title, description, parentEpic) {
      const label = slugLabel('feature', title);
      return {
        id: label,
        url: '',
        virtualFeature: {
          label,
          epicId: parentEpic.id,
          epicKey: parentEpic.key,
          featureTitle: title,
          featureDescription: description,
        },
      };
    },

    async createUserStory(title, details: StoryDetails, parent: WorkItemRef) {
      const labels: string[] = [];
      let epicKey = parent.key;
      const descriptionParts: string[] = [];

      if (parent.virtualFeature) {
        labels.push(parent.virtualFeature.label);
        epicKey = parent.virtualFeature.epicKey;
        descriptionParts.push(`Feature: ${parent.virtualFeature.featureTitle}`);
        if (parent.virtualFeature.featureDescription) {
          descriptionParts.push(parent.virtualFeature.featureDescription);
        }
      }

      if (details.businessValue) {
        labels.push(valueLabel(details.businessValue));
      }
      if (details.riskImpact) {
        labels.push(riskLabel(details.riskImpact as 'High' | 'Medium' | 'Low'));
      }

      if (details.acceptanceCriteria?.length) {
        descriptionParts.push('Acceptance Criteria:');
        details.acceptanceCriteria.forEach((ac) => descriptionParts.push(`- ${ac}`));
      }
      if (details.description) {
        descriptionParts.push(details.description);
      }

      if (!epicKey) {
        throw new Error('Cannot create Jira story without a parent Epic key (D8c Epic → Story).');
      }

      const fields: Record<string, unknown> = {
        project: { key: config.projectKey },
        summary: title,
        issuetype: { name: storyType },
        parent: { key: epicKey },
        labels,
      };

      if (descriptionParts.length) {
        fields.description = toAdf(descriptionParts.join('\n'));
      }

      return createIssue(fields);
    },

    async linkParent(_child, _parent) {
      // Hierarchy is set via `parent` on create for Jira (D8c). No-op.
    },

    async linkDependency(from, dependsOn) {
      // "Blocks": dependsOn blocks `from` (from is blocked by dependsOn).
      const response = await jiraFetch(`${base}/rest/api/3/issueLink`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: { name: 'Blocks' },
          inwardIssue: { key: from.key },
          outwardIssue: { key: dependsOn.key },
        }),
      });

      if (!response.ok) {
        let errorDetails = `Request failed with status ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorDetails =
            errorData.errorMessages?.join('; ') ||
            JSON.stringify(errorData.errors || errorData);
        } catch {
          /* ignore */
        }
        throw new Error(
          `Failed to link dependency ${from.key} -> ${dependsOn.key} (Status: ${response.status}): ${errorDetails}`
        );
      }
    },
  };
}
