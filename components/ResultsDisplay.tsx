import React, { useState } from 'react';
import type { Epic, Feature, UserStory } from '../types';
import type { ExportedWorkItem } from '../services/apiClient';

const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const Tag: React.FC<{ label: string; value: 'High' | 'Medium' | 'Low' }> = ({ label, value }) => {
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

const UserStoryCard: React.FC<{
  story: UserStory;
  editable: boolean;
  onChange: (story: UserStory) => void;
}> = ({ story, editable, onChange }) => {
  const handleCopy = () => {
    let textToCopy = `User Story (${story.id}): ${story.story}\n`;
    textToCopy += `Business Value: ${story.business_value}, Risk/Impact: ${story.risk_impact}\n\n`;
    textToCopy += `Acceptance Criteria:\n${story.acceptance_criteria.map((ac) => `- ${ac}`).join('\n')}\n`;
    if (story.dependencies.length > 0) {
      textToCopy += `Dependencies: ${story.dependencies.join(', ')}\n`;
    }
    navigator.clipboard.writeText(textToCopy.trim());
  };
  return (
    <div className="bg-surface p-4 rounded-lg border border-border relative group transition-all hover:border-accent/50">
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-8">
          <p className="font-semibold text-accent mb-2">
            User Story <span className="text-xs font-mono text-foreground-muted">({story.id})</span>
          </p>
          {editable ? (
            <textarea
              value={story.story}
              onChange={(e) => onChange({ ...story, story: e.target.value })}
              rows={2}
              className="w-full text-foreground-secondary italic mb-3 p-2 bg-surface-muted border border-border rounded-md focus:ring-2 focus:ring-accent focus:outline-none"
            />
          ) : (
            <p className="text-foreground-secondary italic mb-3">"{story.story}"</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy details"
          className="absolute top-3 right-3 p-1.5 bg-surface-muted rounded-md text-foreground-muted hover:bg-border hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
        <Tag label="Business Value" value={story.business_value} />
        <Tag label="Risk/Impact" value={story.risk_impact} />
      </div>

      <p className="font-semibold text-foreground mb-2">Acceptance Criteria:</p>
      <ul className="list-disc list-inside space-y-1 text-foreground-secondary text-sm">
        {story.acceptance_criteria.map((ac, i) => (
          <li key={i}>{ac}</li>
        ))}
      </ul>
      {story.dependencies && story.dependencies.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <p className="font-semibold text-foreground mb-1 text-sm">Dependencies:</p>
          <div className="flex flex-wrap gap-2">
            {story.dependencies.map((dep) => (
              <span key={dep} className="px-2 py-1 bg-surface-muted text-foreground-secondary rounded-md text-xs font-mono border border-border">
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const FeatureCard: React.FC<{
  feature: Feature;
  editable: boolean;
  onChange: (feature: Feature) => void;
}> = ({ feature, editable, onChange }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 bg-surface-muted hover:bg-border/60 transition-colors duration-200"
      >
        <div className="text-left flex-1">
          <p className="text-sm text-accent font-medium">Feature</p>
          {editable ? (
            <input
              value={feature.feature}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ ...feature, feature: e.target.value })}
              className="mt-1 w-full text-lg font-bold text-foreground bg-surface border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-accent focus:outline-none"
            />
          ) : (
            <h3 className="text-lg font-bold text-foreground">{feature.feature}</h3>
          )}
          {editable ? (
            <textarea
              value={feature.feature_description}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ ...feature, feature_description: e.target.value })}
              rows={2}
              className="mt-2 w-full text-sm text-foreground-secondary bg-surface border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-accent focus:outline-none"
            />
          ) : (
            <p className="text-sm text-foreground-secondary mt-1">{feature.feature_description}</p>
          )}
        </div>
        <div className={`text-foreground-muted ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </div>
      </button>
      {isOpen && (
        <div className="p-4 space-y-4">
          {feature.user_stories.map((story, si) => (
            <UserStoryCard
              key={story.id}
              story={story}
              editable={editable}
              onChange={(next) => {
                const user_stories = feature.user_stories.map((s, i) => (i === si ? next : s));
                onChange({ ...feature, user_stories });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const EpicCard: React.FC<{
  epic: Epic;
  index: number;
  editable: boolean;
  onChange: (epic: Epic) => void;
}> = ({ epic, index, editable, onChange }) => {
  const [isOpen, setIsOpen] = useState(index === 0);
  return (
    <div className="bg-background border-2 border-border rounded-xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-6 bg-surface hover:bg-surface-muted transition-colors duration-200"
      >
        <div className="text-left flex-1">
          <p className="text-sm text-accent font-semibold tracking-wider uppercase">Epic</p>
          {editable ? (
            <input
              value={epic.epic}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ ...epic, epic: e.target.value })}
              className="mt-1 w-full text-2xl font-extrabold text-foreground bg-surface-muted border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-accent focus:outline-none"
            />
          ) : (
            <h2 className="text-2xl font-extrabold text-foreground mt-1">{epic.epic}</h2>
          )}
          {editable ? (
            <textarea
              value={epic.epic_description}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onChange({ ...epic, epic_description: e.target.value })}
              rows={2}
              className="mt-2 w-full text-md text-foreground-secondary bg-surface-muted border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-accent focus:outline-none"
            />
          ) : (
            <p className="text-md text-foreground-secondary mt-2">{epic.epic_description}</p>
          )}
        </div>
        <div className={`text-foreground-muted ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </div>
      </button>
      {isOpen && (
        <div className="p-6 space-y-4">
          {epic.features.map((feature, i) => (
            <FeatureCard
              key={i}
              feature={feature}
              editable={editable}
              onChange={(next) => {
                const features = epic.features.map((f, fi) => (fi === i ? next : f));
                onChange({ ...epic, features });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export interface ResultsDisplayProps {
  results: Epic[];
  editable?: boolean;
  onResultsChange?: (results: Epic[]) => void;
  onExport?: () => void;
  onCancel?: () => void;
  exportDisabled?: boolean;
  isExporting?: boolean;
  showExportActions?: boolean;
  exportedItems?: ExportedWorkItem[] | null;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  results,
  editable = false,
  onResultsChange,
  onExport,
  onCancel,
  exportDisabled = false,
  isExporting = false,
  showExportActions = false,
  exportedItems = null,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-brand-secondary">
        Generated Agile Plan
      </h2>

      {showExportActions && (
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground">Review before export</p>
            <p className="text-sm text-foreground-secondary">
              Edit titles and story text below, then export to your configured work tracker.
            </p>
          </div>
          <div className="flex gap-2">
            {isExporting && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg border border-border text-foreground-secondary hover:bg-surface-muted"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled || isExporting}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold disabled:opacity-50"
            >
              {isExporting ? 'Exporting…' : 'Export to tracker'}
            </button>
          </div>
        </div>
      )}

      {exportedItems && exportedItems.length > 0 && (
        <div className="bg-success-bg border border-border rounded-xl p-4">
          <p className="font-semibold text-success mb-2">Created work items</p>
          <ul className="space-y-1 text-sm">
            {exportedItems.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <span className="text-foreground-muted uppercase text-xs mr-2">{item.kind}</span>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {item.key || item.id}: {item.title}
                  </a>
                ) : (
                  <span className="text-foreground-secondary">
                    {item.key || item.id}: {item.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.map((epic, i) => (
        <EpicCard
          key={i}
          epic={epic}
          index={i}
          editable={editable}
          onChange={(next) => {
            if (!onResultsChange) return;
            onResultsChange(results.map((e, ei) => (ei === i ? next : e)));
          }}
        />
      ))}
    </div>
  );
};

export default ResultsDisplay;
