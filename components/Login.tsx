import React, { useState, FormEvent } from 'react';
import type { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Product Owner' | 'Business Analyst' | 'Scrum Master'>('Product Owner');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onLogin({ name: name.trim(), role });
    }
  };

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
            <p className="text-foreground-secondary mt-2">Please sign in to continue</p>
        </div>

        <div className="bg-surface p-8 rounded-xl shadow-sm border border-border">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground-secondary">Your Name</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Jane Doe"
                required
                className="mt-1 w-full p-3 bg-surface-muted border border-border rounded-md text-foreground focus:ring-2 focus:ring-accent focus:outline-none"
              />
            </div>
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
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
