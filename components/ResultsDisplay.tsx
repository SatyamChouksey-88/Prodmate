import React, { useState } from 'react';
import type { Epic, Feature, UserStory } from '../types';

const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

const Tag: React.FC<{ label: string, value: 'High' | 'Medium' | 'Low' }> = ({ label, value }) => {
    const colorClasses = {
        High: 'bg-danger-bg text-danger',
        Medium: 'bg-warning-bg text-warning',
        Low: 'bg-success-bg text-success',
    };
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground-muted">{label}:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClasses[value]}`}>
                {value}
            </span>
        </div>
    );
};

const UserStoryCard: React.FC<{ story: UserStory }> = ({ story }) => {
    const handleCopy = () => {
        let textToCopy = `User Story (${story.id}): ${story.story}\n`;
        textToCopy += `Business Value: ${story.business_value}, Risk/Impact: ${story.risk_impact}\n\n`;
        textToCopy += `Acceptance Criteria:\n${story.acceptance_criteria.map(ac => `- ${ac}`).join('\n')}\n`;
        if (story.dependencies.length > 0) {
           textToCopy += `Dependencies: ${story.dependencies.join(', ')}\n`
        }
        navigator.clipboard.writeText(textToCopy.trim());
    };
    return (
        <div className="bg-surface p-4 rounded-lg border border-border relative group transition-all hover:border-accent/50">
             <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-accent mb-2">
                        User Story <span className="text-xs font-mono text-foreground-muted">({story.id})</span>
                    </p>
                    <p className="text-foreground-secondary italic mb-3 pr-8">"{story.story}"</p>
                </div>
                <button onClick={handleCopy} title="Copy details" className="absolute top-3 right-3 p-1.5 bg-surface-muted rounded-md text-foreground-muted hover:bg-border hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
             </div>
            
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
                <Tag label="Business Value" value={story.business_value} />
                <Tag label="Risk/Impact" value={story.risk_impact} />
            </div>

            <p className="font-semibold text-foreground mb-2">Acceptance Criteria:</p>
            <ul className="list-disc list-inside space-y-1 text-foreground-secondary text-sm">
                {story.acceptance_criteria.map((ac, i) => <li key={i}>{ac}</li>)}
            </ul>
            {story.dependencies && story.dependencies.length > 0 && (
                 <div className="mt-4 pt-3 border-t border-border">
                    <p className="font-semibold text-foreground mb-1 text-sm">Dependencies:</p>
                    <div className="flex flex-wrap gap-2">
                        {story.dependencies.map(dep => (
                            <span key={dep} className="px-2 py-1 bg-surface-muted text-foreground-secondary rounded-md text-xs font-mono border border-border">{dep}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const FeatureCard: React.FC<{ feature: Feature; index: number }> = ({ feature }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-4 bg-surface-muted hover:bg-border/60 transition-colors duration-200">
                <div className="text-left">
                    <p className="text-sm text-accent font-medium">Feature</p>
                    <h3 className="text-lg font-bold text-foreground">{feature.feature}</h3>
                    <p className="text-sm text-foreground-secondary mt-1">{feature.feature_description}</p>
                </div>
                <div className={`text-foreground-muted ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDownIcon />
                </div>
            </button>
            {isOpen && (
                <div className="p-4 space-y-4">
                    {feature.user_stories.map((story) => <UserStoryCard key={story.id} story={story} />)}
                </div>
            )}
        </div>
    );
};


const EpicCard: React.FC<{ epic: Epic; index: number }> = ({ epic, index }) => {
    const [isOpen, setIsOpen] = useState(index === 0);
    return (
        <div className="bg-background border-2 border-border rounded-xl overflow-hidden shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-6 bg-surface hover:bg-surface-muted transition-colors duration-200">
                <div className="text-left">
                    <p className="text-sm text-accent font-semibold tracking-wider uppercase">Epic</p>
                    <h2 className="text-2xl font-extrabold text-foreground mt-1">{epic.epic}</h2>
                     <p className="text-md text-foreground-secondary mt-2">{epic.epic_description}</p>
                </div>
                <div className={`text-foreground-muted ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDownIcon />
                </div>
            </button>
            {isOpen && (
                <div className="p-6 space-y-4">
                     {epic.features.map((feature, i) => <FeatureCard key={i} feature={feature} index={i} />)}
                </div>
            )}
        </div>
    );
}

const ResultsDisplay: React.FC<{ results: Epic[] }> = ({ results }) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-brand-secondary">Generated Agile Plan</h2>
      {results.map((epic, i) => <EpicCard key={i} epic={epic} index={i} />)}
    </div>
  );
};

export default ResultsDisplay;
