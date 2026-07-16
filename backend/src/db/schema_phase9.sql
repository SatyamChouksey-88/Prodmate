-- Phase 9: allow ClickUp as a tracker provider (D12)

ALTER TABLE tracker_configs DROP CONSTRAINT IF EXISTS tracker_configs_provider_check;
ALTER TABLE tracker_configs ADD CONSTRAINT tracker_configs_provider_check
  CHECK (provider IN ('azure-devops', 'jira', 'clickup'));
