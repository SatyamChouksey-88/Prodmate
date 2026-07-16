import React from 'react';
import type { User } from '../types';

interface HeaderProps {
    user: User;
    onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <header className="bg-surface border-b border-border shadow-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
                <div className="p-2 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                Agile Story Generator
                </h1>
            </div>
            <div className="flex items-center gap-4">
                 <div className="text-right hidden sm:block">
                    <p className="font-semibold text-foreground">{user.name}</p>
                    <p className="text-xs text-foreground-muted">{user.role}</p>
                 </div>
                 <button onClick={onLogout} title="Logout" className="p-2 bg-surface-muted rounded-full text-foreground-secondary hover:bg-border hover:text-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                 </button>
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
