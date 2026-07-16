import React, { useEffect, useState } from 'react';
import {
  apiAddStoryNote,
  apiPatchStoryCollab,
  type StoryCollabItem,
  type StoryNote,
} from '../services/apiClient';

interface StoryCollabPanelProps {
  generationId: string;
  storyId: string;
  collab?: StoryCollabItem | null;
  /** Notes for this story — loaded once at App via batch GET /notes (not per-panel). */
  notes?: StoryNote[];
  onCollabChange?: (item: StoryCollabItem) => void;
  onNoteAdded?: (note: StoryNote) => void;
}

const StoryCollabPanel: React.FC<StoryCollabPanelProps> = ({
  generationId,
  storyId,
  collab,
  notes = [],
  onCollabChange,
  onNoteAdded,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [assignee, setAssignee] = useState(collab?.assigneeLabel ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAssignee(collab?.assigneeLabel ?? '');
  }, [collab?.assigneeLabel]);

  const reviewed = Boolean(collab?.reviewedAt);
  const summaryBits = [
    collab?.assigneeLabel ? `Assignee: ${collab.assigneeLabel}` : null,
    reviewed ? 'Reviewed' : null,
    notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center text-left gap-2"
        aria-expanded={isOpen}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          Collaboration
          {summaryBits.length > 0 && (
            <span className="ml-2 font-normal normal-case text-foreground-secondary">
              ({summaryBits.join(' · ')})
            </span>
          )}
        </span>
        <span className="text-foreground-muted text-sm shrink-0">{isOpen ? 'Hide' : 'Show'}</span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-foreground-muted">
            Metadata only — not access control
          </p>

          <div>
            <label
              htmlFor={`assignee-${storyId}`}
              className="block text-sm text-foreground-secondary mb-1"
            >
              Assignee label
            </label>
            <div className="flex gap-2">
              <input
                id={`assignee-${storyId}`}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="e.g. Alex or alex@example.com"
                className="flex-1 text-sm p-2 bg-surface-muted border border-border rounded-md focus:ring-2 focus:ring-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const item = await apiPatchStoryCollab(generationId, storyId, {
                      assigneeLabel: assignee.trim() || null,
                    });
                    onCollabChange?.(item);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to save assignee');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="text-sm px-3 py-2 rounded-lg border border-border disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground-secondary">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                setError(null);
                try {
                  const item = await apiPatchStoryCollab(generationId, storyId, {
                    reviewed: e.target.checked,
                  });
                  onCollabChange?.(item);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : 'Failed to update review marker'
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            Mark reviewed (optional — does not block export)
          </label>

          <div>
            <p className="text-sm font-medium text-foreground-secondary mb-1">Notes</p>
            {notes.length === 0 ? (
              <p className="text-xs text-foreground-muted">No notes yet.</p>
            ) : (
              <ul className="space-y-1 max-h-28 overflow-y-auto text-sm">
                {notes.map((n) => (
                  <li key={n.id} className="bg-surface-muted rounded-md px-2 py-1">
                    <p className="text-foreground-secondary">{n.body}</p>
                    <p className="text-xs text-foreground-muted">{n.createdAt}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a note…"
                className="flex-1 text-sm p-2 bg-surface-muted border border-border rounded-md focus:ring-2 focus:ring-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const note = await apiAddStoryNote(generationId, storyId, draft.trim());
                    onNoteAdded?.(note);
                    setDraft('');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to add note');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="text-sm px-3 py-2 rounded-lg border border-border disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default StoryCollabPanel;
