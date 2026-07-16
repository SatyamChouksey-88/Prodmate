import type {
  JiraConfig,
  StoryDetails,
  WorkItemRef,
  WorkItemTrackerAdapter,
} from './types.js';

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

async function jiraFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error contacting Jira. Check base URL.\n${String(error)}`);
    }
    throw error;
  }
}

function getAuthHeader(email: string, apiToken: string) {
  return 'Basic ' + Buffer.from(`${email}:${apiToken}`, 'utf8').toString('base64');
}

function sanitizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createJiraAdapter(config: JiraConfig): WorkItemTrackerAdapter {
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
      let errorDetails = `Status ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch {
        /* ignore */
      }
      throw new Error(`Failed to create Jira issue: ${errorDetails}`);
    }

    const result = (await response.json()) as { id: string; key: string };
    return { id: String(result.id), key: result.key, url: `${base}/browse/${result.key}` };
  }

  return {
    provider: 'jira',

    async testConnection(): Promise<string> {
      const response = await jiraFetch(
        `${base}/rest/api/3/project/${encodeURIComponent(config.projectKey)}`,
        { method: 'GET', headers: { Authorization: auth, Accept: 'application/json' } }
      );
      if (!response.ok) {
        throw new Error(`Jira connection test failed (Status: ${response.status})`);
      }
      const result = (await response.json()) as { name: string; key: string };
      return `Successfully connected to Jira project: "${result.name}" (${result.key})!`;
    },

    async createEpic(title, description) {
      const fields: Record<string, unknown> = {
        project: { key: config.projectKey },
        summary: title,
        issuetype: { name: 'Epic' },
      };
      if (description) fields.description = toAdf(description);
      return createIssue(fields);
    },

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

      if (details.businessValue) labels.push(`value:${details.businessValue}`);
      if (details.riskImpact) labels.push(`risk:${details.riskImpact}`);

      if (details.acceptanceCriteria?.length) {
        descriptionParts.push('Acceptance Criteria:');
        details.acceptanceCriteria.forEach((ac) => descriptionParts.push(`- ${ac}`));
      }

      if (!epicKey) {
        throw new Error('Cannot create Jira story without parent Epic key (D8c).');
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

    async linkParent() {
      /* parent set on create */
    },

    async linkDependency(from, dependsOn) {
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
        throw new Error(`Failed to link Jira dependency (Status: ${response.status})`);
      }
    },
  };
}
