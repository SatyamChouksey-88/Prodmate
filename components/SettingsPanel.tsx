import React, { useState, useEffect, FormEvent } from 'react';
import {
  testTrackerConnection,
  type TrackerConfig,
  type TrackerProvider,
} from '../services/trackers';

interface SettingsPanelProps {
  config: TrackerConfig | null;
  onSave: (config: TrackerConfig) => void;
  integrationsEnabled: boolean;
}

const emptyAdo = (): TrackerConfig => ({
  provider: 'azure-devops',
  orgUrl: '',
  project: '',
  pat: '',
});

const emptyJira = (): TrackerConfig => ({
  provider: 'jira',
  baseUrl: '',
  projectKey: '',
  email: '',
  apiToken: '',
  storyIssueType: 'Story',
});

const SettingsPanel: React.FC<SettingsPanelProps> = ({ config, onSave, integrationsEnabled }) => {
  const [isOpen, setIsOpen] = useState(!config || !isConfigured(config));
  const [formState, setFormState] = useState<TrackerConfig>(config ?? emptyAdo());
  const [isSaved, setIsSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (config) {
      setFormState(config);
    }
  }, [config]);

  const handleProviderChange = (provider: TrackerProvider) => {
    if (provider === formState.provider) return;
    setFormState(provider === 'jira' ? emptyJira() : emptyAdo());
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!integrationsEnabled) return;
    onSave(formState);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTestConnection = async () => {
    if (!integrationsEnabled) return;
    setTestStatus('testing');
    setTestMessage('');
    try {
      const successMessage = await testTrackerConnection(formState);
      setTestStatus('success');
      setTestMessage(successMessage);
    } catch (err: unknown) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTimeout(() => setTestStatus('idle'), 6000);
    }
  };

  const isFormInvalid = !isConfigured(formState);
  const isTesting = testStatus === 'testing';
  const actionsDisabled = !integrationsEnabled || isFormInvalid;

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 text-left"
      >
        <h3 className="text-lg font-bold text-foreground">Tracker Settings</h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-border p-4">
          {!integrationsEnabled && (
            <div className="mb-4 text-xs text-warning bg-warning-bg p-2 rounded-md border border-border-strong">
              <strong>Integrations disabled.</strong> Browser-direct tracker calls are blocked in this
              build. Enable only for local demos via{' '}
              <code>VITE_ALLOW_INSECURE_CLIENT_LLM=true</code> in <code>.env.local</code> (dev only).
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="provider" className="block text-sm font-medium text-foreground-secondary">
                Work tracker
              </label>
              <select
                id="provider"
                value={formState.provider}
                onChange={(e) => handleProviderChange(e.target.value as TrackerProvider)}
                disabled={!integrationsEnabled}
                className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
              >
                <option value="azure-devops">Azure DevOps</option>
                <option value="jira">Jira Cloud</option>
              </select>
            </div>

            {formState.provider === 'azure-devops' && (
              <>
                <div>
                  <label htmlFor="orgUrl" className="block text-sm font-medium text-foreground-secondary">
                    Organization URL
                  </label>
                  <input
                    type="text"
                    id="orgUrl"
                    value={formState.orgUrl}
                    onChange={(e) => setFormState({ ...formState, orgUrl: e.target.value })}
                    placeholder="https://dev.azure.com/your-org"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="project" className="block text-sm font-medium text-foreground-secondary">
                    Project Name
                  </label>
                  <input
                    type="text"
                    id="project"
                    value={formState.project}
                    onChange={(e) => setFormState({ ...formState, project: e.target.value })}
                    placeholder="Your Project Name"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="pat" className="block text-sm font-medium text-foreground-secondary">
                    Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    id="pat"
                    value={formState.pat}
                    onChange={(e) => setFormState({ ...formState, pat: e.target.value })}
                    placeholder="Enter your PAT"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
              </>
            )}

            {formState.provider === 'jira' && (
              <>
                <div>
                  <label htmlFor="baseUrl" className="block text-sm font-medium text-foreground-secondary">
                    Jira Cloud URL
                  </label>
                  <input
                    type="text"
                    id="baseUrl"
                    value={formState.baseUrl}
                    onChange={(e) => setFormState({ ...formState, baseUrl: e.target.value })}
                    placeholder="https://your-domain.atlassian.net"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="projectKey" className="block text-sm font-medium text-foreground-secondary">
                    Project Key
                  </label>
                  <input
                    type="text"
                    id="projectKey"
                    value={formState.projectKey}
                    onChange={(e) => setFormState({ ...formState, projectKey: e.target.value })}
                    placeholder="PROJ"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground-secondary">
                    Atlassian account email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="you@example.com"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="apiToken" className="block text-sm font-medium text-foreground-secondary">
                    API token
                  </label>
                  <input
                    type="password"
                    id="apiToken"
                    value={formState.apiToken}
                    onChange={(e) => setFormState({ ...formState, apiToken: e.target.value })}
                    placeholder="Atlassian API token"
                    required
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-xs text-foreground-muted mt-1">
                    Create a token at{' '}
                    <a
                      href="https://id.atlassian.com/manage-profile/security/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      id.atlassian.com
                    </a>
                    . Features become <code>feature:…</code> labels (D8c); value/risk as{' '}
                    <code>value:…</code> / <code>risk:…</code> labels.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="storyIssueType"
                    className="block text-sm font-medium text-foreground-secondary"
                  >
                    Story issue type name
                  </label>
                  <input
                    type="text"
                    id="storyIssueType"
                    value={formState.storyIssueType ?? 'Story'}
                    onChange={(e) => setFormState({ ...formState, storyIssueType: e.target.value })}
                    placeholder="Story"
                    disabled={!integrationsEnabled}
                    className="mt-1 w-full p-2 bg-surface-muted border border-border rounded-md text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50"
                  />
                </div>
              </>
            )}

            <div className="text-xs text-warning bg-warning-bg p-2 rounded-md border border-border">
              <strong>Security Note:</strong> When enabled for local demos, credentials are stored in
              plaintext in localStorage. Do not use against production orgs. Phase 3 moves credentials
              server-side.
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={actionsDisabled}
                className="w-full sm:w-auto flex-grow bg-surface-muted text-foreground font-semibold py-2 px-4 rounded-lg border border-border hover:bg-border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent transition-colors duration-300 disabled:opacity-50"
              >
                {isSaved ? 'Settings Saved!' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={actionsDisabled || isTesting}
                className="w-full sm:w-auto flex-grow bg-surface text-foreground font-semibold py-2 px-4 rounded-lg border border-border hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTesting ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </button>
            </div>
            {testStatus !== 'idle' && testMessage && (
              <div
                className={`mt-3 text-sm p-3 rounded-md animate-fade-in ${
                  testStatus === 'success' ? 'bg-success-bg text-success' : ''
                } ${testStatus === 'error' ? 'bg-danger-bg text-danger' : ''}`}
              >
                <p className="font-semibold">{testStatus === 'success' ? 'Success' : 'Error'}</p>
                <div className="whitespace-pre-wrap">{testMessage}</div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

function isConfigured(config: TrackerConfig): boolean {
  if (config.provider === 'jira') {
    return Boolean(
      config.baseUrl.trim() &&
        config.projectKey.trim() &&
        config.email.trim() &&
        config.apiToken.trim()
    );
  }
  return Boolean(config.orgUrl.trim() && config.project.trim() && config.pat.trim());
}

export default SettingsPanel;
