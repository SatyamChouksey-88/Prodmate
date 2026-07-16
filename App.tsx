import React, { useState, useCallback, useEffect } from 'react';
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
  type ApiUser,
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

type Status = 'idle' | 'generating' | 'exporting' | 'success' | 'error';

const TRACKER_STORAGE_PREFIX = 'agile-gen-tracker-';
const LEGACY_ADO_STORAGE_PREFIX = 'agile-gen-ado-';

function loadLocalTrackerConfig(userName: string): TrackerConfig | null {
  const modern = localStorage.getItem(`${TRACKER_STORAGE_PREFIX}${userName}`);
  if (modern) return normalizeTrackerConfig(JSON.parse(modern));
  const legacy = localStorage.getItem(`${LEGACY_ADO_STORAGE_PREFIX}${userName}`);
  if (legacy) return normalizeTrackerConfig(JSON.parse(legacy));
  return null;
}

const App: React.FC = () => {
  const apiMode = isApiMode();
  const [currentUser, setCurrentUser] = useState<(User | ApiUser) | null>(null);
  const [authReady, setAuthReady] = useState(!apiMode);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [trackerConfig, setTrackerConfig] = useState<TrackerConfig | null>(null);
  const [results, setResults] = useState<Epic[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');

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
        const userHistory = localStorage.getItem(`agile-gen-history-${user.email || user.name}`);
        setHistory(userHistory ? JSON.parse(userHistory) : []);
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
        const key = 'email' in user ? user.email : user.name;
        const userHistory = localStorage.getItem(`agile-gen-history-${key}`);
        setHistory(userHistory ? JSON.parse(userHistory) : []);
      })();
    }
  };

  const handleLogout = async () => {
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
    setStatus('success');
    setError(null);
  };

  const historyKey = currentUser
    ? 'email' in currentUser && currentUser.email
      ? currentUser.email
      : currentUser.name
    : '';

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
      if (!isTrackerConfigured(trackerConfig) && !apiMode) {
        setError('Please configure your work tracker settings before generating a plan.');
        setStatus('error');
        return;
      }
      if (apiMode && !trackerConfig) {
        setError('Please configure and save your work tracker settings before generating.');
        setStatus('error');
        return;
      }
      if (!inputText.trim()) {
        setError('Please enter some text or upload a document for the main requirement.');
        setStatus('error');
        return;
      }

      setStatus('generating');
      setProgressMessage('Generating your agile stories...');
      setError(null);
      setResults(null);

      try {
        let generatedEpics: Epic[];
        let generationId: string | undefined;

        if (apiMode) {
          const result = await apiGenerate(inputText, knowledgeBase);
          generatedEpics = result.epics;
          generationId = result.generationId;
        } else {
          generatedEpics = await generateStories(inputText, knowledgeBase);
        }

        setResults(generatedEpics);
        setStatus('exporting');
        setProgressMessage('Exporting to work tracker...');

        if (apiMode) {
          await apiExport(generatedEpics, generationId);
        } else {
          await exportToTracker(trackerConfig!, generatedEpics, (progress) => {
            setProgressMessage(progress);
          });
        }

        const newHistoryItem: HistoryItem = {
          id: new Date().toISOString(),
          title: generatedEpics[0]?.epic || 'Untitled Plan',
          date: new Date().toLocaleString(),
          data: generatedEpics,
        };
        const updatedHistory = [newHistoryItem, ...history];
        setHistory(updatedHistory);
        localStorage.setItem(`agile-gen-history-${historyKey}`, JSON.stringify(updatedHistory));

        setStatus('success');
        setProgressMessage('Generation and export complete!');
      } catch (err: unknown) {
        console.error(err);
        setError(
          `An error occurred: ${err instanceof Error ? err.message : 'Please check your settings and try again.'}`
        );
        setStatus('error');
      }
    },
    [currentUser, trackerConfig, history, clientIntegrationsEnabled, apiMode, historyKey]
  );

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

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Header user={currentUser} onLogout={handleLogout} />
      {!apiMode && !clientIntegrationsEnabled && (
        <div className="bg-warning-bg border-b border-border-strong text-warning px-4 py-3 text-sm" role="status">
          <p className="container mx-auto max-w-7xl">
            <strong>Demo mode — not for shared or production use.</strong>{' '}
            Set <code className="font-mono text-xs">VITE_API_URL</code> to use the Phase 3 backend, or enable
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
            <HistoryPanel history={history} onSelect={handleSelectHistory} />
          </aside>

          <div className="lg:col-span-8 xl:col-span-9">
            <InputArea
              onGenerate={handleGenerate}
              isLoading={isLoading}
              isAdoConfigured={trackerReady}
              integrationsEnabled={canUseIntegrations}
            />
            <div className="mt-12">
              {isLoading && <Loader message={progressMessage} />}
              {status === 'error' && error && <ErrorMessage message={error} />}
              {results && <ResultsDisplay results={results} />}
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
