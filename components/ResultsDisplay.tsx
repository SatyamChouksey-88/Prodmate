import React, { useEffect, useId, useState } from 'react';
import type { Epic, Feature, UserStory, StoryPoints } from '../types';
import { STORY_POINTS_OPTIONS } from '../types';
import type { ExportedWorkItem, BacklogMatch } from '../services/apiClient';

/**
 * Band 4 — local draft state (commit on blur), not React.memo.
 *
 * Why: memo on cards only skips sibling re-renders; each keystroke still called
 * `setResults` in App and re-rendered Header/Settings/History/InputArea. Draft
 * fields keep typing local until blur, so App state (and the rest of the tree)
 * only updates when an edit is committed.
 */

const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const fieldClass =
  'w-full bg-surface-muted border border-border rounded-md px-2 py-1 text-foreground focus:ring-2 focus:ring-accent focus:outline-none';

const DraftInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  stopPropagation?: boolean;
}> = ({ id, label, value, onCommit, className = '', stopPropagation }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="mt-1">
      <label htmlFor={id} className="block text-xs font-medium text-foreground-muted mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={draft}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        className={`${fieldClass} ${className}`}
      />
    </div>
  );
};

const DraftTextarea: React.FC<{
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => void;
  rows?: number;
  className?: string;
  stopPropagation?: boolean;
}> = ({ id, label, value, onCommit, rows = 2, className = '', stopPropagation }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="mt-1">
      <label htmlFor={id} className="block text-xs font-medium text-foreground-muted mb-1">
        {label}
      </label>
      <textarea
        id={id}
        value={draft}
        rows={rows}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        className={`${fieldClass} ${className}`}
      />
    </div>
  );
};

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
  const storyFieldId = useId();
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
            <DraftTextarea
              id={storyFieldId}
              label="Story text"
              value={story.story}
              rows={2}
              className="italic text-foreground-secondary"
              onCommit={(storyText) => onChange({ ...story, story: storyText })}
            />
          ) : (
            <p className="text-foreground-secondary italic mb-3">"{story.story}"</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy details"
          aria-label={`Copy user story ${story.id}`}
          className="absolute top-3 right-3 p-1.5 bg-surface-muted rounded-md text-foreground-muted hover:bg-border hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4 mt-3 items-center">
        <Tag label="Business Value" value={story.business_value} />
        <Tag label="Risk/Impact" value={story.risk_impact} />
        {editable ? (
          <div className="flex items-center gap-2">
            <label htmlFor={`${storyFieldId}-points`} className="text-sm font-medium text-foreground-muted">
              Story points:
            </label>
            <select
              id={`${storyFieldId}-points`}
              value={story.story_points ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const story_points = raw
                  ? (Number(raw) as StoryPoints)
                  : undefined;
                onChange({ ...story, story_points });
              }}
              className="text-sm bg-surface-muted border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-accent focus:outline-none"
            >
              <option value="">—</option>
              {STORY_POINTS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ) : (
          story.story_points != null && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground-muted">Story points:</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-foreground">
                {story.story_points}
              </span>
            </div>
          )
        )}
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
  const titleId = useId();
  const descId = useId();
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
            <>
              <DraftInput
                id={titleId}
                label="Feature title"
                value={feature.feature}
                stopPropagation
                className="text-lg font-bold"
                onCommit={(featureTitle) => onChange({ ...feature, feature: featureTitle })}
              />
              <DraftTextarea
                id={descId}
                label="Feature description"
                value={feature.feature_description}
                stopPropagation
                className="text-sm text-foreground-secondary"
                onCommit={(feature_description) => onChange({ ...feature, feature_description })}
              />
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-foreground">{feature.feature}</h3>
              <p className="text-sm text-foreground-secondary mt-1">{feature.feature_description}</p>
            </>
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
  const titleId = useId();
  const descId = useId();
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
            <>
              <DraftInput
                id={titleId}
                label="Epic title"
                value={epic.epic}
                stopPropagation
                className="text-2xl font-extrabold"
                onCommit={(epicTitle) => onChange({ ...epic, epic: epicTitle })}
              />
              <DraftTextarea
                id={descId}
                label="Epic description"
                value={epic.epic_description}
                stopPropagation
                className="text-md text-foreground-secondary"
                onCommit={(epic_description) => onChange({ ...epic, epic_description })}
              />
            </>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold text-foreground mt-1">{epic.epic}</h2>
              <p className="text-md text-foreground-secondary mt-2">{epic.epic_description}</p>
            </>
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
  /** True when listed items are from a cancelled / partial export */
  exportPartial?: boolean;
  onCheckBacklog?: () => void;
  isCheckingBacklog?: boolean;
  backlogMatches?: BacklogMatch[] | null;
  backlogScanned?: number | null;
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
  exportPartial = false,
  onCheckBacklog,
  isCheckingBacklog = false,
  backlogMatches = null,
  backlogScanned = null,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-bold text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-brand-secondary">
        Generated Agile Plan
      </h2>

      {showExportActions && (
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">Review before export</p>
              <p className="text-sm text-foreground-secondary">
                Edit titles and story text below, then export to your configured work tracker.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onCheckBacklog && (
                <button
                  type="button"
                  onClick={onCheckBacklog}
                  disabled={exportDisabled || isExporting || isCheckingBacklog}
                  className="px-4 py-2 rounded-lg border border-border text-foreground-secondary hover:bg-surface-muted disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent"
                >
                  {isCheckingBacklog ? 'Checking backlog…' : 'Check backlog'}
                </button>
              )}
              {isExporting && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-lg border border-border text-foreground-secondary hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={onExport}
                disabled={exportDisabled || isExporting}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent"
              >
                {isExporting ? 'Exporting…' : 'Export to tracker'}
              </button>
            </div>
          </div>
          {isExporting && (
            <p className="text-xs text-warning" role="note">
              Cancelling aborts the in-flight request so the server usually stops creating further
              items (via request close). Work items already written to the tracker are not rolled
              back.
            </p>
          )}
        </div>
      )}

      {backlogMatches && (
        <div className="bg-warning-bg border border-border rounded-xl p-4" role="status">
          <p className="font-semibold text-warning mb-1">Possible backlog overlaps</p>
          <p className="text-sm text-foreground-secondary mb-3">
            Informational only — export is not blocked.
            {backlogScanned != null ? ` Scanned ${backlogScanned} recent tracker items.` : ''}
          </p>
          {backlogMatches.length === 0 ? (
            <p className="text-sm text-foreground-secondary">No close matches found in the recent slice.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {backlogMatches.map((m) => (
                <li key={`${m.storyId}-${m.existing.id}`} className="border-t border-border pt-2">
                  <span className="uppercase text-xs font-semibold text-foreground-muted mr-2">
                    {m.kind}
                  </span>
                  <span className="text-foreground-muted text-xs mr-2">
                    score {m.score.toFixed(2)}
                  </span>
                  <span className="text-foreground-secondary">Generated {m.storyId} ≈ </span>
                  {m.existing.url ? (
                    <a
                      href={m.existing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {m.existing.key || m.existing.id}: {m.existing.title}
                    </a>
                  ) : (
                    <span>
                      {m.existing.key || m.existing.id}: {m.existing.title}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {exportedItems && exportedItems.length > 0 && (
        <div className="bg-success-bg border border-border rounded-xl p-4">
          <p className="font-semibold text-success mb-2">
            {exportPartial ? 'Work items created before cancel' : 'Created work items'}
          </p>
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
