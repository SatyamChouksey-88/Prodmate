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

function loadTrackerConfig(userName: string): TrackerConfig | null {
  const modern = localStorage.getItem(`${TRACKER_STORAGE_PREFIX}${userName}`);
  if (modern) {
    return normalizeTrackerConfig(JSON.parse(modern));
  }
  const legacy = localStorage.getItem(`${LEGACY_ADO_STORAGE_PREFIX}${userName}`);
  if (legacy) {
    return normalizeTrackerConfig(JSON.parse(legacy));
  }
  return null;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [trackerConfig, setTrackerConfig] = useState<TrackerConfig | null>(null);
  
  const [results, setResults] = useState<Epic[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('');

  const clientIntegrationsEnabled = isInsecureClientIntegrationsEnabled();

  useEffect(() => {
    const savedUser = localStorage.getItem('agile-gen-user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      handleLogin(user, false);
    }
  }, []);

  const handleLogin = (user: User, shouldSave: boolean = true) => {
    setCurrentUser(user);
    if (shouldSave) {
        localStorage.setItem('agile-gen-user', JSON.stringify(user));
    }
    
    const userHistory = localStorage.getItem(`agile-gen-history-${user.name}`);
    setHistory(userHistory ? JSON.parse(userHistory) : []);

    setTrackerConfig(loadTrackerConfig(user.name));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setHistory([]);
    setTrackerConfig(null);
    setResults(null);
    setStatus('idle');
    localStorage.removeItem('agile-gen-user');
  };

  const handleSaveTrackerConfig = (config: TrackerConfig) => {
    if (!currentUser) return;
    if (!clientIntegrationsEnabled) return;
    setTrackerConfig(config);
    localStorage.setItem(`${TRACKER_STORAGE_PREFIX}${currentUser.name}`, JSON.stringify(config));
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setResults(item.data);
    setStatus('success');
    setError(null);
  }

  const handleGenerate = useCallback(async (inputText: string, knowledgeBase: string) => {
    if (!currentUser) {
      setError('You must be logged in to perform this action.');
      return;
    }
    if (!clientIntegrationsEnabled) {
      setError(CLIENT_INTEGRATIONS_DISABLED_MESSAGE);
      setStatus('error');
      return;
    }
    if (!isTrackerConfigured(trackerConfig)) {
      setError('Please configure your work tracker settings before generating a plan.');
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
      const generatedEpics = await generateStories(inputText, knowledgeBase);
      setResults(generatedEpics);

      setStatus('exporting');
      setProgressMessage('Exporting to work tracker...');
      
      await exportToTracker(trackerConfig!, generatedEpics, (progress) => {
          setProgressMessage(progress);
      });
      
      const newHistoryItem: HistoryItem = {
        id: new Date().toISOString(),
        title: generatedEpics[0]?.epic || 'Untitled Plan',
        date: new Date().toLocaleString(),
        data: generatedEpics,
      };
      const updatedHistory = [newHistoryItem, ...history];
      setHistory(updatedHistory);
      localStorage.setItem(`agile-gen-history-${currentUser.name}`, JSON.stringify(updatedHistory));

      setStatus('success');
      setProgressMessage('Generation and export complete!');

    } catch (err: any) {
      console.error(err);
      setError(`An error occurred: ${err.message || 'Please check your settings and try again.'}`);
      setStatus('error');
    }
  }, [currentUser, trackerConfig, history, clientIntegrationsEnabled]);

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const isLoading = status === 'generating' || status === 'exporting';

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Header user={currentUser} onLogout={handleLogout} />
      {!clientIntegrationsEnabled && (
        <div className="bg-warning-bg border-b border-border-strong text-warning px-4 py-3 text-sm" role="status">
          <p className="container mx-auto max-w-7xl">
            <strong>Demo mode — not for shared or production use.</strong>{' '}
            Client-side Gemini and tracker calls are disabled so API keys and PATs are not used from the browser.
            A backend will own secrets in Phase 3. For local demos only (<code className="font-mono text-xs">npm run dev</code>), set{' '}
            <code className="font-mono text-xs">VITE_ALLOW_INSECURE_CLIENT_LLM=true</code> in{' '}
            <code className="font-mono text-xs">.env.local</code>.
          </p>
        </div>
      )}
      <main className="container mx-auto px-4 py-8 max-w-7xl">
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <aside className="lg:col-span-4 xl:col-span-3 space-y-6 lg:sticky lg:top-8">
                <SettingsPanel
                  config={trackerConfig}
                  onSave={handleSaveTrackerConfig}
                  integrationsEnabled={clientIntegrationsEnabled}
                />
                <HistoryPanel history={history} onSelect={handleSelectHistory} />
            </aside>
            
            <div className="lg:col-span-8 xl:col-span-9">
                <InputArea
                  onGenerate={handleGenerate}
                  isLoading={isLoading}
                  isAdoConfigured={isTrackerConfigured(trackerConfig)}
                  integrationsEnabled={clientIntegrationsEnabled}
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
