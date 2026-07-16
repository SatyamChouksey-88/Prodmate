import { createAzureDevOpsAdapter } from './azureDevOpsAdapter';
import { createClickUpAdapter } from './clickUpAdapter';
import { createJiraAdapter } from './jiraAdapter';
import { exportBacklog } from './exportBacklog';
import type { TrackerConfig, WorkItemTrackerAdapter } from './types';

export type {
  TrackerProvider,
  TrackerConfig,
  AzureDevOpsConfig,
  JiraConfig,
  ClickUpConfig,
  ADOConfig,
  WorkItemRef,
  WorkItemTrackerAdapter,
  StoryDetails,
} from './types';

export {
  isTrackerConfigured,
  normalizeTrackerConfig,
} from './types';

export { exportBacklog, ExportAbortedError } from './exportBacklog';
export type { CreatedWorkItem, ExportResult } from './exportBacklog';
export { describeExportPlan } from './describeExportPlan';
export type { PreviewLine } from './describeExportPlan';

export function createTrackerAdapter(
  config: TrackerConfig,
  opts?: { signal?: AbortSignal }
): WorkItemTrackerAdapter {
  if (config.provider === 'jira') {
    return createJiraAdapter(config);
  }
  if (config.provider === 'clickup') {
    return createClickUpAdapter(config, opts);
  }
  return createAzureDevOpsAdapter(config);
}

export async function testTrackerConnection(config: TrackerConfig): Promise<string> {
  return createTrackerAdapter(config).testConnection();
}

export async function exportToTracker(
  config: TrackerConfig,
  epics: Parameters<typeof exportBacklog>[1],
  onProgress: (message: string) => void,
  signal?: AbortSignal
): Promise<import('./exportBacklog').ExportResult> {
  const adapter = createTrackerAdapter(config, { signal });
  return exportBacklog(adapter, epics, onProgress, signal);
}
