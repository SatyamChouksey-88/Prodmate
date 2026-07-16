/**
 * Backward-compatible ADO surface.
 * Prefer services/trackers for new code (multi-provider).
 */
import type { Epic } from '../types';
import {
  createTrackerAdapter,
  exportToTracker,
  type AzureDevOpsConfig,
  type ADOConfig as TrackerADOConfig,
} from './trackers';

export type { ADOConfig } from './trackers';

function toAzureConfig(config: TrackerADOConfig): AzureDevOpsConfig {
  return {
    provider: 'azure-devops',
    orgUrl: config.orgUrl,
    project: config.project,
    pat: config.pat,
  };
}

export async function testADOConnection(config: TrackerADOConfig): Promise<string> {
  return createTrackerAdapter(toAzureConfig(config)).testConnection();
}

export async function exportToADO(
  config: TrackerADOConfig,
  epics: Epic[],
  onProgress: (message: string) => void
): Promise<void> {
  await exportToTracker(toAzureConfig(config), epics, onProgress);
}
