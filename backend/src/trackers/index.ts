import { createAzureDevOpsAdapter } from './azureDevOpsAdapter.js';
import { createJiraAdapter } from './jiraAdapter.js';
import { exportBacklog } from './exportBacklog.js';
import type { TrackerConfig, WorkItemTrackerAdapter } from './types.js';

export type { TrackerConfig, WorkItemTrackerAdapter } from './types.js';
export { isTrackerConfigured } from './types.js';
export { exportBacklog } from './exportBacklog.js';
export type { CreatedWorkItem, ExportResult } from './exportBacklog.js';

export function createTrackerAdapter(config: TrackerConfig): WorkItemTrackerAdapter {
  if (config.provider === 'jira') {
    return createJiraAdapter(config);
  }
  return createAzureDevOpsAdapter(config);
}
