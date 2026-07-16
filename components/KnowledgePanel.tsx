import React, { useCallback, useEffect, useState } from 'react';
import {
  apiDeleteKnowledgeDocument,
  apiIngestKnowledgeDocument,
  apiListKnowledgeDocuments,
  type KnowledgeDocument,
} from '../services/apiClient';
import { DeleteIcon } from './icons';

const KnowledgePanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; content?: string }>({});

  const refresh = useCallback(async () => {
    try {
      setDocuments(await apiListKnowledgeDocuments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge documents');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { title?: string; content?: string } = {};
    if (!title.trim()) nextErrors.title = 'Title is required.';
    if (!content.trim()) nextErrors.content = 'Content is required.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError('Fix the highlighted fields before ingesting.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await apiIngestKnowledgeDocument({
        title: title.trim(),
        content,
        sourceFilename,
      });
      setTitle('');
      setContent('');
      setSourceFilename(null);
      setFieldErrors({});
      setInfo(`Ingested ${result.chunkCount} chunk${result.chunkCount === 1 ? '' : 's'}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setContent(text);
      setSourceFilename(file.name);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, '') || file.name);
      }
      setFieldErrors((prev) => ({ ...prev, content: undefined }));
    };
    reader.readAsText(file);
  };

  const handleDelete = async (doc: KnowledgeDocument) => {
    setBusy(true);
    setError(null);
    try {
      await apiDeleteKnowledgeDocument(doc.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 text-left"
      >
        <h3 className="text-lg font-bold text-foreground">Knowledge Mesh</h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-border p-4 space-y-4">
          <p className="text-sm text-foreground-secondary">
            Ingest docs once; generate retrieves relevant chunks automatically. Your data stays
            private to your account.
          </p>

          <form onSubmit={handleIngest} className="space-y-3" noValidate>
            <div>
              <label htmlFor="knowledge-title" className="block text-sm font-medium text-foreground-secondary mb-1">
                Document title
              </label>
              <input
                id="knowledge-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
                }}
                placeholder="e.g. Payment policy notes"
                disabled={busy}
                aria-invalid={Boolean(fieldErrors.title)}
                className={`w-full p-2 bg-surface-muted border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none ${
                  fieldErrors.title ? 'border-danger' : 'border-border'
                }`}
              />
              {fieldErrors.title && <p className="mt-1 text-xs text-danger">{fieldErrors.title}</p>}
            </div>
            <div>
              <label htmlFor="knowledge-content" className="block text-sm font-medium text-foreground-secondary mb-1">
                Content
              </label>
              <textarea
                id="knowledge-content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (fieldErrors.content) setFieldErrors((prev) => ({ ...prev, content: undefined }));
                }}
                placeholder="Paste domain notes, past tickets, or policy text…"
                disabled={busy}
                rows={4}
                aria-invalid={Boolean(fieldErrors.content)}
                className={`w-full p-2 bg-surface-muted border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-accent focus:outline-none ${
                  fieldErrors.content ? 'border-danger' : 'border-border'
                }`}
              />
              {fieldErrors.content && <p className="mt-1 text-xs text-danger">{fieldErrors.content}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="text-sm px-3 py-2 rounded-lg border border-border bg-surface-muted hover:bg-border cursor-pointer">
                Upload .txt / .md
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="text-sm px-3 py-2 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Ingest'}
              </button>
            </div>
          </form>

          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          {info && <p className="text-sm text-success">{info}</p>}

          {loadingList ? (
            <p className="text-sm text-foreground-muted">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-foreground-muted">No documents ingested yet.</p>
          ) : (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-start gap-1 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{doc.title}</p>
                    <p className="text-xs text-foreground-muted">
                      {doc.chunkCount} chunk{doc.chunkCount === 1 ? '' : 's'}
                      {doc.sourceFilename ? ` · ${doc.sourceFilename}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Delete"
                    aria-label={`Delete knowledge document ${doc.title}`}
                    disabled={busy}
                    onClick={() => void handleDelete(doc)}
                    className="px-2 text-foreground-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-accent rounded-md disabled:opacity-50"
                  >
                    <DeleteIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default KnowledgePanel;
