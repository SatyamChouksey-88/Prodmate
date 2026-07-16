import React, { useEffect, useState } from 'react';
import {
  apiAddStoryNote,
  apiListStoryNotes,
  apiPatchStoryCollab,
  type StoryCollabItem,
} from '../services/apiClient';

interface StoryCollabPanelProps {
  generationId: string;
  storyId: string;
  collab?: StoryCollabItem | null;
  onCollabChange?: (item: StoryCollabItem) => void;
}

const StoryCollabPanel: React.FC<StoryCollabPanelProps> = ({
  generationId,
  storyId,
  collab,
  onCollabChange,
}) => {
  const [notes, setNotes] = useState<
    Array<{ id: string; body: string; authorUserId: string; createdAt: string }>
  >([]);
  const [draft, setDraft] = useState('');
  const [assignee, setAssignee] = useState(collab?.assigneeLabel ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAssignee(collab?.assigneeLabel ?? '');
  }, [collab?.assigneeLabel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiListStoryNotes(generationId, storyId);
        if (!cancelled) setNotes(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load notes');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generationId, storyId]);

  const reviewed = Boolean(collab?.reviewedAt);

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        Collaboration (metadata only — not access control)
      </p>

      <div>
        <label htmlFor={`assignee-${storyId}`} className="block text-sm text-foreground-secondary mb-1">
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
              setError(err instanceof Error ? err.message : 'Failed to update review marker');
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
                setNotes((prev) => [...prev, note]);
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
  );
};

export default StoryCollabPanel;
