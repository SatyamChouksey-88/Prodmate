import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateStories } from './services/geminiService';
import {
  exportToTracker,
  isTrackerConfigured,
  normalizeTrackerConfig,
  type TrackerConfig,
} from './services/trackers';
import type { Epic, User, HistoryItem } from './types';
import {
  CLIENT_INTEGRATIONS_DISABLED_MESSAGE,
  isInsecureClientIntegrationsEnabled,
} from './config/runtimeFlags';
import {
  isApiMode,
  apiMe,
  apiLogout,
  apiGenerate,
  apiExport,
  apiGetTrackerSettings,
  apiSaveTrackerSettings,
  apiGetHistory,
  apiDeleteHistoryItem,
  apiClearHistory,
  type ApiUser,
  type ExportedWorkItem,
} from './services/apiClient';
import Header from './components/Header';
import InputArea from './components/InputArea';
import ResultsDisplay from './components/ResultsDisplay';
import Loader from './components/Loader';
import ErrorMessage from './components/ErrorMessage';
import WelcomeMessage from './components/WelcomeMessage';
import Login from './components/Login';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';

/** generating → ready (review) → exporting → success | error (retry keeps results) */
type Status = 'idle' | 'generating' | 'ready' | 'exporting' | 'success' | 'error';

const TRACKER_STORAGE_PREFIX = 'agile-gen-tracker-';
const LEGACY_ADO_STORAGE_PREFIX = 'agile-gen-ado-';

function loadLocalTrackerConfig(userName: string): TrackerConfig | null {
  const modern = localStorage.getItem(`${TRACKER_STORAGE_PREFIX}${userName}`);
  if (modern) return normalizeTrackerConfig(JSON.parse(modern));
  const legacy = localStorage.getItem(`${LEGACY_ADO_STORAGE_PREFIX}${userName}`);
  if (legacy) return normalizeTrackerConfig(JSON.parse(legacy));
  return null;
}

async function loadApiHistory(): Promise<HistoryItem[]> {
  try {
    return await apiGetHistory();
  } catch {
    return [];
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

const App: React.FC = () => {
  const apiMode = isApiMode();
  const [currentUser, setCurrentUser] = useState<(User | ApiUser) | null>(null);
  const [authReady, setAuthReady] = useState(!apiMode);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [trackerConfig, setTrackerConfig] = useState<TrackerConfig | null>(null);
  const [results, setResults] = useState<Epic[] | null>(null);
  const [generationId, setGenerationId] = useState<string | undefined>();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [exportedItems, setExportedItems] = useState<ExportedWorkItem[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clientIntegrationsEnabled = !apiMode && isInsecureClientIntegrationsEnabled();
  const canUseIntegrations = apiMode || clientIntegrationsEnabled;

  useEffect(() => {
    if (!apiMode) {
      const savedUser = localStorage.getItem('agile-gen-user');
      if (savedUser) {
        handleLogin(JSON.parse(savedUser), false);
      }
      return;
    }

    (async () => {
      const user = await apiMe();
      if (user) {
        setCurrentUser(user);
        try {
          setTrackerConfig(await apiGetTrackerSettings());
        } catch {
          setTrackerConfig(null);
        }
        setHistory(await loadApiHistory());
      }
      setAuthReady(true);
    })();
  }, [apiMode]);

  const handleLogin = (user: User | ApiUser, shouldSave: boolean = true) => {
    setCurrentUser(user);
    if (!apiMode) {
      if (shouldSave) {
        localStorage.setItem('agile-gen-user', JSON.stringify(user));
      }
      const key = user.name;
      const userHistory = localStorage.getItem(`agile-gen-history-${key}`);
      setHistory(userHistory ? JSON.parse(userHistory) : []);
      setTrackerConfig(loadLocalTrackerConfig(key));
    } else {
      (async () => {
        try {
          setTrackerConfig(await apiGetTrackerSettings());
        } catch {
          setTrackerConfig(null);
        }
        setHistory(await loadApiHistory());
      })();
    }
  };

  const handleLogout = async () => {
    abortRef.current?.abort();
    if (apiMode) {
      try {
        await apiLogout();
      } catch {
        /* ignore */
      }
    } else {
      localStorage.removeItem('agile-gen-user');
    }
    setCurrentUser(null);
    setHistory([]);
    setTrackerConfig(null);
    setResults(null);
    setGenerationId(undefined);
    setExportedItems(null);
    setStatus('idle');
  };

  const handleSaveTrackerConfig = async (config: TrackerConfig) => {
    if (!currentUser) return;
    if (apiMode) {
      const saved = await apiSaveTrackerSettings(config);
      setTrackerConfig(saved);
      return;
    }
    if (!clientIntegrationsEnabled) return;
    setTrackerConfig(config);
    localStorage.setItem(`${TRACKER_STORAGE_PREFIX}${currentUser.name}`, JSON.stringify(config));
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setResults(item.data);
    setGenerationId(apiMode ? item.id : undefined);
    setExportedItems(null);
    setStatus('ready');
    setError(null);
  };

  const historyKey = currentUser
    ? 'email' in currentUser && currentUser.email
      ? currentUser.email
      : currentUser.name
    : '';

  const persistDemoHistory = (epics: Epic[], existingId?: string) => {
    const newHistoryItem: HistoryItem = {
      id: existingId || new Date().toISOString(),
      title: epics[0]?.epic || 'Untitled Plan',
      date: new Date().toLocaleString(),
      data: epics,
    };
    setHistory((prev) => {
      const updatedHistory = [newHistoryItem, ...prev.filter((h) => h.id !== newHistoryItem.id)];
      localStorage.setItem(`agile-gen-history-${historyKey}`, JSON.stringify(updatedHistory));
      return updatedHistory;
    });
    return newHistoryItem.id;
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgressMessage('Cancelled.');
    if (results) {
      setStatus('ready');
    } else {
      setStatus('idle');
    }
  };

  const handleGenerate = useCallback(
    async (inputText: string, knowledgeBase: string) => {
      if (!currentUser) {
        setError('You must be logged in to perform this action.');
        return;
      }
      if (!apiMode && !clientIntegrationsEnabled) {
        setError(CLIENT_INTEGRATIONS_DISABLED_MESSAGE);
        setStatus('error');
        return;
      }
      if (!inputText.trim()) {
        setError('Please enter some text or upload a document for the main requirement.');
        setStatus('error');
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('generating');
      setProgressMessage('Generating your agile stories...');
      setError(null);
      setResults(null);
      setGenerationId(undefined);
      setExportedItems(null);

      try {
        let generatedEpics: Epic[];
        let nextGenerationId: string | undefined;

        if (apiMode) {
          const result = await apiGenerate(inputText, knowledgeBase, controller.signal);
          generatedEpics = result.epics;
          nextGenerationId = result.generationId;
          setHistory(await loadApiHistory());
        } else {
          generatedEpics = await generateStories(inputText, knowledgeBase);
          nextGenerationId = persistDemoHistory(generatedEpics);
        }

        setResults(generatedEpics);
        setGenerationId(nextGenerationId);
        setStatus('ready');
        setProgressMessage('Review the plan, then export when ready.');
      } catch (err: unknown) {
        if (isAbortError(err)) {
          setStatus(results ? 'ready' : 'idle');
          setProgressMessage('Cancelled.');
          return;
        }
        console.error(err);
        setError(
          `An error occurred: ${err instanceof Error ? err.message : 'Please check your settings and try again.'}`
        );
        setStatus('error');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [currentUser, clientIntegrationsEnabled, apiMode, historyKey]
  );

  const handleExport = useCallback(async () => {
    if (!results || !currentUser) return;

    if (!apiMode && !clientIntegrationsEnabled) {
      setError(CLIENT_INTEGRATIONS_DISABLED_MESSAGE);
      setStatus('error');
      return;
    }
    if (!isTrackerConfigured(trackerConfig) && !apiMode) {
      setError('Please configure your work tracker settings before exporting.');
      setStatus('error');
      return;
    }
    if (apiMode && !trackerConfig) {
      setError('Please configure and save your work tracker settings before exporting.');
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('exporting');
    setProgressMessage('Exporting to work tracker...');
    setError(null);
    setExportedItems(null);

    try {
      if (apiMode) {
        const result = await apiExport(results, generationId, controller.signal);
        setExportedItems(result.created);
        setHistory(await loadApiHistory());
      } else {
        const result = await exportToTracker(trackerConfig!, results, (progress) => {
          setProgressMessage(progress);
        });
        setExportedItems(
          result.created.map((item) => ({
            kind: item.kind,
            title: item.title,
            id: item.ref.id,
            url: item.ref.url,
            key: item.ref.key,
          }))
        );
        persistDemoHistory(results, generationId);
      }

      setStatus('success');
      setProgressMessage('Export complete!');
    } catch (err: unknown) {
      if (isAbortError(err)) {
        setStatus('ready');
        setProgressMessage('Export cancelled. Your plan is still here.');
        return;
      }
      console.error(err);
      setError(
        `Export failed: ${err instanceof Error ? err.message : 'Please check your settings and try again.'}`
      );
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [
    results,
    currentUser,
    clientIntegrationsEnabled,
    apiMode,
    trackerConfig,
    generationId,
    historyKey,
  ]);

  const handleDeleteHistory = async (item: HistoryItem) => {
    if (apiMode) {
      try {
        await apiDeleteHistoryItem(item.id);
        setHistory(await loadApiHistory());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete history item');
      }
      return;
    }
    const updated = history.filter((h) => h.id !== item.id);
    setHistory(updated);
    localStorage.setItem(`agile-gen-history-${historyKey}`, JSON.stringify(updated));
  };

  const handleClearHistory = async () => {
    if (!confirm('Clear all history for this account?')) return;
    if (apiMode) {
      try {
        await apiClearHistory();
        setHistory([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to clear history');
      }
      return;
    }
    setHistory([]);
    localStorage.removeItem(`agile-gen-history-${historyKey}`);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground-secondary">
        Loading…
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const isLoading = status === 'generating' || status === 'exporting';
  const trackerReady = apiMode
    ? Boolean(trackerConfig)
    : isTrackerConfigured(trackerConfig);
  const showReviewActions =
    Boolean(results) && (status === 'ready' || status === 'error' || status === 'exporting' || status === 'success');

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Header user={currentUser} onLogout={handleLogout} />
      {!apiMode && !clientIntegrationsEnabled && (
        <div className="bg-warning-bg border-b border-border-strong text-warning px-4 py-3 text-sm" role="status">
          <p className="container mx-auto max-w-7xl">
            <strong>Demo mode — not for shared or production use.</strong>{' '}
            Set <code className="font-mono text-xs">VITE_API_URL</code> to use the backend, or enable
            insecure local integrations only under <code className="font-mono text-xs">npm run dev</code>.
          </p>
        </div>
      )}
      {apiMode && (
        <div className="bg-success-bg border-b border-border text-success px-4 py-2 text-sm" role="status">
          <p className="container mx-auto max-w-7xl">
            Connected to API — Gemini key and tracker credentials stay on the server.
          </p>
        </div>
      )}
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-4 xl:col-span-3 space-y-6 lg:sticky lg:top-8">
            <SettingsPanel
              config={trackerConfig}
              onSave={handleSaveTrackerConfig}
              integrationsEnabled={canUseIntegrations}
              useApi={apiMode}
            />
            <HistoryPanel
              history={history}
              onSelect={handleSelectHistory}
              onDelete={handleDeleteHistory}
              onClear={handleClearHistory}
            />
          </aside>

          <div className="lg:col-span-8 xl:col-span-9">
            <InputArea
              onGenerate={handleGenerate}
              isLoading={isLoading}
              isAdoConfigured={trackerReady}
              integrationsEnabled={canUseIntegrations}
              onCancel={isLoading ? handleCancel : undefined}
            />
            <div className="mt-12">
              {status === 'generating' && <Loader message={progressMessage} />}
              {status === 'exporting' && <Loader message={progressMessage} />}
              {status === 'error' && error && (
                <div className="mb-6 space-y-3">
                  <ErrorMessage message={error} />
                  {results && (
                    <button
                      type="button"
                      onClick={handleExport}
                      className="px-4 py-2 rounded-lg border border-border bg-surface font-semibold hover:bg-surface-muted"
                    >
                      Retry export
                    </button>
                  )}
                </div>
              )}
              {results && (
                <ResultsDisplay
                  results={results}
                  editable={status === 'ready' || status === 'error'}
                  onResultsChange={setResults}
                  showExportActions={showReviewActions}
                  onExport={handleExport}
                  onCancel={status === 'exporting' ? handleCancel : undefined}
                  isExporting={status === 'exporting'}
                  exportDisabled={!trackerReady}
                  exportedItems={exportedItems}
                />
              )}
              {!isLoading && status !== 'error' && !results && <WelcomeMessage />}
            </div>
          </div>
        </div>
      </main>
      <footer className="text-center py-6 text-foreground-muted text-sm">
        <p>Powered by Gemini API</p>
      </footer>
    </div>
  );
};

export default App;
