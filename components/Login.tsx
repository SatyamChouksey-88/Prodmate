import React, { useState, FormEvent } from 'react';
import type { User } from '../types';
import { isApiMode, apiLogin, apiRegister, type ApiUser } from '../services/apiClient';

interface LoginProps {
  onLogin: (user: User | ApiUser) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const apiMode = isApiMode();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'Product Owner' | 'Business Analyst' | 'Scrum Master'>('Product Owner');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validationMessage = (): string | null => {
    if (!apiMode) {
      return name.trim() ? null : 'Enter your name to continue.';
    }
    if (mode === 'register' && !name.trim()) return 'Name is required to register.';
    if (!email.trim()) return 'Email is required.';
    if (!password) return 'Password is required.';
    if (mode === 'register' && password.length < 8) return 'Password must be at least 8 characters.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = validationMessage();
    if (message) {
      setError(message);
      return;
    }
    setError(null);

    if (!apiMode) {
      onLogin({ name: name.trim(), role });
      return;
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const user = await apiRegister({ email, password, name: name.trim() || email, role });
        onLogin(user);
      } else {
        const user = await apiLogin({ email, password });
        onLogin(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = validationMessage() === null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
            <div className="p-3 inline-block bg-gradient-to-r from-brand-primary to-brand-secondary rounded-xl mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            </div>
            <h1 className="text-3xl font-bold text-foreground">Agile Story Generator</h1>
            <p className="text-foreground-secondary mt-2">
              {apiMode ? 'Sign in with email and password' : 'Please sign in to continue (demo mode)'}
            </p>
        </div>

        <div className="bg-surface p-8 rounded-xl shadow-sm border border-border">
          {apiMode && (
            <div className="flex gap-2 mb-6">
              <button type="button" onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md text-sm font-medium ${mode === 'login' ? 'bg-accent text-accent-foreground' : 'bg-surface-muted text-foreground-secondary'}`}>
                Login
              </button>
              <button type="button" onClick={() => setMode('register')} className={`flex-1 py-2 rounded-md text-sm font-medium ${mode === 'register' ? 'bg-accent text-accent-foreground' : 'bg-surface-muted text-foreground-secondary'}`}>
                Register
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {(!apiMode || mode === 'register') && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-foreground-secondary">Your Name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Jane Doe"
                  required={!apiMode || mode === 'register'}
                  className="mt-1 w-full p-3 bg-surface-muted border border-border rounded-md text-foreground focus:ring-2 focus:ring-accent focus:outline-none"
                />
              </div>
            )}
            {apiMode && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground-secondary">Email</label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1 w-full p-3 bg-surface-muted border border-border rounded-md text-foreground focus:ring-2 focus:ring-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-foreground-secondary">Password</label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    className="mt-1 w-full p-3 bg-surface-muted border border-border rounded-md text-foreground focus:ring-2 focus:ring-accent focus:outline-none"
                  />
                </div>
              </>
            )}
            {(!apiMode || mode === 'register') && (
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-foreground-secondary">Your Role</label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as User['role'])}
                  className="mt-1 w-full p-3 bg-surface-muted border border-border rounded-md text-foreground focus:ring-2 focus:ring-accent focus:outline-none"
                >
                  <option>Product Owner</option>
                  <option>Business Analyst</option>
                  <option>Scrum Master</option>
                </select>
              </div>
            )}
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              aria-disabled={!canSubmit || busy}
              className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Please wait…' : apiMode ? (mode === 'register' ? 'Create account' : 'Login') : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
