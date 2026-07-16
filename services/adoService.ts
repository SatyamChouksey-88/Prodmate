/**
 * Backward-compatible ADO surface.
 * Prefer services/trackers for new code (multi-provider).
 * ADO behavior is preserved via AzureDevOpsAdapter — do not delete this module.
 */
import type { Epic } from '../types';
import {
  createTrackerAdapter,
  exportToTracker,
  type AzureDevOpsConfig,
  type ADOConfig as TrackerADOConfig,
  type ExportResult,
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
  onProgress: (message: string) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  return exportToTracker(toAzureConfig(config), epics, onProgress, signal);
}
