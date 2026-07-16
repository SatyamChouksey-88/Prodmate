import React, { useEffect, useId, useState } from 'react';
import type { Epic, Feature, UserStory, StoryPoints } from '../types';
import { STORY_POINTS_OPTIONS } from '../types';
import type { ExportedWorkItem, BacklogMatch, StoryCollabItem, StoryNote } from '../services/apiClient';
import StoryCollabPanel from './StoryCollabPanel';

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
  /** Fired only when blur commits a real change (draft !== value). */
  onEditCommitted?: () => void;
  className?: string;
  stopPropagation?: boolean;
}> = ({ id, label, value, onCommit, onEditCommitted, className = '', stopPropagation }) => {
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
          if (draft !== value) {
            onCommit(draft);
            onEditCommitted?.();
          }
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
  /** Fired only when blur commits a real change (draft !== value). */
  onEditCommitted?: () => void;
  rows?: number;
  className?: string;
  stopPropagation?: boolean;
}> = ({ id, label, value, onCommit, onEditCommitted, rows = 2, className = '', stopPropagation }) => {
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
          if (draft !== value) {
            onCommit(draft);
            onEditCommitted?.();
          }
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
  onRefine?: (storyId: string, instruction: string) => Promise<void>;
  refining?: boolean;
  generationId?: string;
  collab?: StoryCollabItem | null;
  notes?: StoryNote[];
  onCollabChange?: (item: StoryCollabItem) => void;
  onNoteAdded?: (note: StoryNote) => void;
  onFieldEdit?: () => void;
}> = ({ story, editable, onChange, onRefine, refining, generationId, collab, notes, onCollabChange, onNoteAdded, onFieldEdit }) => {
  const storyFieldId = useId();
  const [showRefine, setShowRefine] = useState(false);
  const [instruction, setInstruction] = useState('');
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
              onEditCommitted={onFieldEdit}
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

      {editable && onRefine && (
        <div className="mt-4 pt-3 border-t border-border">
          {!showRefine ? (
            <button
              type="button"
              onClick={() => setShowRefine(true)}
              className="text-sm text-accent hover:underline"
            >
              Refine story…
            </button>
          ) : (
            <div className="space-y-2">
              <label htmlFor={`${storyFieldId}-refine`} className="block text-sm font-medium text-foreground-secondary">
                Refinement instruction
              </label>
              <textarea
                id={`${storyFieldId}-refine`}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={2}
                placeholder='e.g. "make acceptance criteria more detailed"'
                disabled={refining}
                className="w-full text-sm bg-surface-muted border border-border rounded-md px-2 py-1 focus:ring-2 focus:ring-accent focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={refining || !instruction.trim()}
                  onClick={async () => {
                    await onRefine(story.id, instruction.trim());
                    setInstruction('');
                    setShowRefine(false);
                  }}
                  className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold disabled:opacity-50"
                >
                  {refining ? 'Refining…' : 'Apply refine'}
                </button>
                <button
                  type="button"
                  disabled={refining}
                  onClick={() => {
                    setShowRefine(false);
                    setInstruction('');
                  }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {generationId && (
        <StoryCollabPanel
          generationId={generationId}
          storyId={story.id}
          collab={collab}
          notes={notes}
          onCollabChange={onCollabChange}
          onNoteAdded={onNoteAdded}
        />
      )}
    </div>
  );
};

const FeatureCard: React.FC<{
  feature: Feature;
  editable: boolean;
  onChange: (feature: Feature) => void;
  epicIndex: number;
  featureIndex: number;
  onRefineStory?: (epicIndex: number, featureIndex: number, storyId: string, instruction: string) => Promise<void>;
  refiningStoryId?: string | null;
  generationId?: string;
  collabByStory?: Record<string, StoryCollabItem>;
  notesByStory?: Record<string, StoryNote[]>;
  onCollabChange?: (item: StoryCollabItem) => void;
  onNoteAdded?: (note: StoryNote) => void;
  onFieldEdit?: () => void;
}> = ({
  feature,
  editable,
  onChange,
  epicIndex,
  featureIndex,
  onRefineStory,
  refiningStoryId,
  generationId,
  collabByStory,
  notesByStory,
  onCollabChange,
  onNoteAdded,
  onFieldEdit,
}) => {
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
                onEditCommitted={onFieldEdit}
              />
              <DraftTextarea
                id={descId}
                label="Feature description"
                value={feature.feature_description}
                stopPropagation
                className="text-sm text-foreground-secondary"
                onCommit={(feature_description) => onChange({ ...feature, feature_description })}
                onEditCommitted={onFieldEdit}
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
              refining={refiningStoryId === story.id}
              generationId={generationId}
              collab={collabByStory?.[story.id] ?? null}
              notes={notesByStory?.[story.id]}
              onCollabChange={onCollabChange}
              onNoteAdded={onNoteAdded}
              onFieldEdit={onFieldEdit}
              onRefine={
                onRefineStory
                  ? (storyId, instruction) =>
                      onRefineStory(epicIndex, featureIndex, storyId, instruction)
                  : undefined
              }
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
  onRefineStory?: (epicIndex: number, featureIndex: number, storyId: string, instruction: string) => Promise<void>;
  refiningStoryId?: string | null;
  generationId?: string;
  collabByStory?: Record<string, StoryCollabItem>;
  notesByStory?: Record<string, StoryNote[]>;
  onCollabChange?: (item: StoryCollabItem) => void;
  onNoteAdded?: (note: StoryNote) => void;
  onFieldEdit?: () => void;
}> = ({
  epic,
  index,
  editable,
  onChange,
  onRefineStory,
  refiningStoryId,
  generationId,
  collabByStory,
  notesByStory,
  onCollabChange,
  onNoteAdded,
  onFieldEdit,
}) => {
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
                onEditCommitted={onFieldEdit}
              />
              <DraftTextarea
                id={descId}
                label="Epic description"
                value={epic.epic_description}
                stopPropagation
                className="text-md text-foreground-secondary"
                onCommit={(epic_description) => onChange({ ...epic, epic_description })}
                onEditCommitted={onFieldEdit}
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
              epicIndex={index}
              featureIndex={i}
              onRefineStory={onRefineStory}
              refiningStoryId={refiningStoryId}
              generationId={generationId}
              collabByStory={collabByStory}
              notesByStory={notesByStory}
              onCollabChange={onCollabChange}
              onNoteAdded={onNoteAdded}
              onFieldEdit={onFieldEdit}
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
  onRefineStory?: (epicIndex: number, featureIndex: number, storyId: string, instruction: string) => Promise<void>;
  refiningStoryId?: string | null;
  exportPreview?: {
    provider: string;
    lines: Array<{ kind: string; title: string; parentHint?: string; fields: string[] }>;
  } | null;
  onRequestExport?: () => void;
  onConfirmExport?: () => void;
  onDismissPreview?: () => void;
  isLoadingPreview?: boolean;
  generationId?: string;
  collabByStory?: Record<string, StoryCollabItem>;
  notesByStory?: Record<string, StoryNote[]>;
  onCollabChange?: (item: StoryCollabItem) => void;
  onNoteAdded?: (note: StoryNote) => void;
  /** Metrics signal when a Draft field commits a real edit (API mode). */
  onFieldEdit?: () => void;
  reviewHint?: string | null;
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
  onRefineStory,
  refiningStoryId = null,
  exportPreview = null,
  onRequestExport,
  onConfirmExport,
  onDismissPreview,
  isLoadingPreview = false,
  generationId,
  collabByStory,
  notesByStory,
  onCollabChange,
  onNoteAdded,
  onFieldEdit,
  reviewHint = null,
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
                onClick={onRequestExport ?? onExport}
                disabled={exportDisabled || isExporting || isLoadingPreview}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent"
              >
                {isLoadingPreview ? 'Building preview…' : isExporting ? 'Exporting…' : 'Export to tracker'}
              </button>
            </div>
          </div>
          {reviewHint && (
            <p className="text-xs text-foreground-muted" role="note">
              {reviewHint}
            </p>
          )}
          {isExporting && (
            <p className="text-xs text-warning" role="note">
              Cancelling aborts the in-flight request so the server usually stops creating further
              items (via request close). Work items already written to the tracker are not rolled
              back.
            </p>
          )}
        </div>
      )}

      {exportPreview && (
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3" role="dialog" aria-label="Export preview">
          <div>
            <p className="font-semibold text-foreground">Export preview ({exportPreview.provider})</p>
            <p className="text-sm text-foreground-secondary">
              Mapped plan only — nothing has been created yet. Confirm to run the live export.
            </p>
          </div>
          <ul className="max-h-64 overflow-y-auto space-y-2 text-sm">
            {exportPreview.lines.map((line, i) => (
              <li key={`${line.kind}-${i}`} className="border-t border-border pt-2">
                <span className="uppercase text-xs font-semibold text-foreground-muted mr-2">{line.kind}</span>
                <span className="font-medium text-foreground">{line.title}</span>
                {line.parentHint && (
                  <span className="text-foreground-muted text-xs ml-2">← {line.parentHint}</span>
                )}
                <ul className="mt-1 text-foreground-secondary list-disc list-inside">
                  {line.fields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirmExport}
              disabled={isExporting}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold disabled:opacity-50"
            >
              Confirm export
            </button>
            <button
              type="button"
              onClick={onDismissPreview}
              disabled={isExporting}
              className="px-4 py-2 rounded-lg border border-border"
            >
              Back
            </button>
          </div>
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
          onRefineStory={onRefineStory}
          refiningStoryId={refiningStoryId}
          generationId={generationId}
          collabByStory={collabByStory}
          notesByStory={notesByStory}
          onCollabChange={onCollabChange}
          onNoteAdded={onNoteAdded}
          onFieldEdit={onFieldEdit}
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
