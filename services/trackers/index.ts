import { createAzureDevOpsAdapter } from './azureDevOpsAdapter';
import { createJiraAdapter } from './jiraAdapter';
import { exportBacklog } from './exportBacklog';
import type { TrackerConfig, WorkItemTrackerAdapter } from './types';

export type {
  TrackerProvider,
  TrackerConfig,
  AzureDevOpsConfig,
  JiraConfig,
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

export function createTrackerAdapter(config: TrackerConfig): WorkItemTrackerAdapter {
  if (config.provider === 'jira') {
    return createJiraAdapter(config);
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
  const adapter = createTrackerAdapter(config);
  return exportBacklog(adapter, epics, onProgress, signal);
}
