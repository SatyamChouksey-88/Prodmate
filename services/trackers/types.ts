/**
 * Multi-tracker adapter contract.
 *
 * To add a new tracker (Linear, GitHub Issues, Monday, Trello, …):
 * 1. Implement WorkItemTrackerAdapter in services/trackers/<name>Adapter.ts
 * 2. Add a config variant to TrackerConfig
 * 3. Register it in createTrackerAdapter()
 * 4. Extend SettingsPanel fields for the new provider
 * Core export orchestration (exportBacklog) should not need changes.
 */

export type TrackerProvider = 'azure-devops' | 'jira';

export interface AzureDevOpsConfig {
  provider: 'azure-devops';
  orgUrl: string;
  project: string;
  pat: string;
}

export interface JiraConfig {
  provider: 'jira';
  /** e.g. https://your-domain.atlassian.net */
  baseUrl: string;
  projectKey: string;
  email: string;
  apiToken: string;
  /** Defaults to "Story" — some projects use "User Story" or "Task". */
  storyIssueType?: string;
}

export type TrackerConfig = AzureDevOpsConfig | JiraConfig;

/** @deprecated Use AzureDevOpsConfig / TrackerConfig — kept for migration. */
export type ADOConfig = Omit<AzureDevOpsConfig, 'provider'> & { provider?: 'azure-devops' };

export interface WorkItemRef {
  id: string;
  url: string;
  /** Jira issue key when applicable */
  key?: string;
  /**
   * D8(c): Jira does not create a mid-level Feature issue.
   * createFeature returns a virtual ref; createUserStory uses the epic + feature label.
   */
  virtualFeature?: {
    label: string;
    epicId: string;
    epicKey?: string;
    featureTitle: string;
    featureDescription?: string;
  };
}

export interface StoryDetails {
  description?: string;
  acceptanceCriteria?: string[];
  businessValue?: 'High' | 'Medium' | 'Low';
  riskImpact?: 'High' | 'Medium' | 'Low';
}

export interface WorkItemTrackerAdapter {
  readonly provider: TrackerProvider;
  testConnection(): Promise<string>;
  createEpic(title: string, description?: string): Promise<WorkItemRef>;
  /**
   * ADO: creates a Feature work item under the epic.
   * Jira (D8c): returns a virtual ref (no API create) used to label stories.
   */
  createFeature(
    title: string,
    description: string | undefined,
    parentEpic: WorkItemRef
  ): Promise<WorkItemRef>;
  createUserStory(
    title: string,
    details: StoryDetails,
    parent: WorkItemRef
  ): Promise<WorkItemRef>;
  linkParent(child: WorkItemRef, parent: WorkItemRef): Promise<void>;
  linkDependency(from: WorkItemRef, dependsOn: WorkItemRef): Promise<void>;
}

export function isTrackerConfigured(config: TrackerConfig | null | undefined): boolean {
  if (!config) return false;
  if (config.provider === 'azure-devops') {
    return Boolean(config.orgUrl?.trim() && config.project?.trim() && config.pat?.trim());
  }
  return Boolean(
    config.baseUrl?.trim() &&
      config.projectKey?.trim() &&
      config.email?.trim() &&
      config.apiToken?.trim()
  );
}

export function normalizeTrackerConfig(raw: unknown): TrackerConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (obj.provider === 'jira') {
    return {
      provider: 'jira',
      baseUrl: String(obj.baseUrl ?? ''),
      projectKey: String(obj.projectKey ?? ''),
      email: String(obj.email ?? ''),
      apiToken: String(obj.apiToken ?? ''),
      storyIssueType: obj.storyIssueType ? String(obj.storyIssueType) : undefined,
    };
  }

  // Legacy ADO configs had no provider field
  if (obj.provider === 'azure-devops' || obj.orgUrl || obj.pat) {
    return {
      provider: 'azure-devops',
      orgUrl: String(obj.orgUrl ?? ''),
      project: String(obj.project ?? ''),
      pat: String(obj.pat ?? ''),
    };
  }

  return null;
}
