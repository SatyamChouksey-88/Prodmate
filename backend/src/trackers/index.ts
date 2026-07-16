import { createAzureDevOpsAdapter } from './azureDevOpsAdapter.js';
import { createClickUpAdapter } from './clickUpAdapter.js';
import { createJiraAdapter } from './jiraAdapter.js';
import { exportBacklog } from './exportBacklog.js';
import type { AdapterFetchOptions } from './adapterOptions.js';
import type { TrackerConfig, WorkItemTrackerAdapter } from './types.js';

export type { TrackerConfig, WorkItemTrackerAdapter } from './types.js';
export { isTrackerConfigured } from './types.js';
export { exportBacklog } from './exportBacklog.js';
export type { CreatedWorkItem, ExportResult } from './exportBacklog.js';

export function createTrackerAdapter(
  trackerConfig: TrackerConfig,
  opts: AdapterFetchOptions = {}
): WorkItemTrackerAdapter {
  if (trackerConfig.provider === 'jira') {
    return createJiraAdapter(trackerConfig, opts);
  }
  if (trackerConfig.provider === 'clickup') {
    return createClickUpAdapter(trackerConfig, opts);
  }
  return createAzureDevOpsAdapter(trackerConfig, opts);
}
