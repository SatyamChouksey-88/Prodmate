export type TrackerProvider = 'azure-devops' | 'jira';

export interface AzureDevOpsConfig {
  provider: 'azure-devops';
  orgUrl: string;
  project: string;
  pat: string;
}

export interface JiraConfig {
  provider: 'jira';
  baseUrl: string;
  projectKey: string;
  email: string;
  apiToken: string;
  storyIssueType?: string;
}

export type TrackerConfig = AzureDevOpsConfig | JiraConfig;

export interface WorkItemRef {
  id: string;
  url: string;
  key?: string;
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
