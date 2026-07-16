import type { User, Epic, HistoryItem } from '../types';
import type { TrackerConfig } from './trackers';

const apiBase = () => (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function isApiMode(): boolean {
  return Boolean(apiBase());
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: unknown }).error;
    const message =
      typeof err === 'string'
        ? err
        : err
          ? JSON.stringify(err)
          : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export type ApiUser = User & { id: string; email: string };

export type ExportedWorkItem = {
  kind: 'epic' | 'feature' | 'story';
  title: string;
  id: string;
  url: string;
  key?: string;
};

export async function apiRegister(input: {
  email: string;
  password: string;
  name: string;
  role: User['role'];
}): Promise<ApiUser> {
  const data = await api<{ user: ApiUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function apiLogin(input: { email: string; password: string }): Promise<ApiUser> {
  const data = await api<{ user: ApiUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function apiLogout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' });
}

export async function apiMe(): Promise<ApiUser | null> {
  try {
    const data = await api<{ user: ApiUser }>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export async function apiGenerate(
  requirement: string,
  knowledgeBase: string,
  signal?: AbortSignal
): Promise<{ generationId: string; epics: Epic[]; retrievedChunkCount?: number }> {
  return api('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ requirement, knowledgeBase }),
    signal,
  });
}

export async function apiRefineStory(input: {
  instruction: string;
  epicIndex: number;
  featureIndex: number;
  storyId: string;
  epics: Epic[];
  generationId?: string;
}): Promise<{ ok: true; story: Epic['features'][number]['user_stories'][number]; epics: Epic[] }> {
  return api('/api/generate/refine-story', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type KnowledgeDocument = {
  id: string;
  title: string;
  sourceFilename: string | null;
  createdAt: string;
  chunkCount: number;
};

export async function apiListKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const data = await api<{ documents: KnowledgeDocument[] }>('/api/knowledge/documents');
  return data.documents;
}

export async function apiIngestKnowledgeDocument(input: {
  title: string;
  content: string;
  sourceFilename?: string | null;
}): Promise<{ documentId: string; chunkCount: number }> {
  return api('/api/knowledge/documents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiDeleteKnowledgeDocument(id: string): Promise<void> {
  await api(`/api/knowledge/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function apiExport(
  epics: Epic[],
  generationId?: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void
): Promise<{ ok: true; progress: string[]; created: ExportedWorkItem[] }> {
  const res = await fetch(`${apiBase()}/api/export`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ epics, generationId }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = (data as { error?: unknown }).error;
    const message =
      typeof err === 'string'
        ? err
        : err
          ? JSON.stringify(err)
          : `Request failed (${res.status})`;
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('ndjson') || !res.body) {
    // Backward-compatible JSON response
    const data = (await res.json()) as {
      ok: true;
      progress: string[];
      created: ExportedWorkItem[];
    };
    return data;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let progress: string[] = [];
  let created: ExportedWorkItem[] = [];
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as
        | { type: 'progress'; message: string }
        | { type: 'done'; ok: true; progress: string[]; created: ExportedWorkItem[] }
        | { type: 'error'; error: string; progress: string[] };
      if (event.type === 'progress') {
        progress.push(event.message);
        onProgress?.(event.message);
      } else if (event.type === 'done') {
        progress = event.progress;
        created = event.created;
      } else if (event.type === 'error') {
        progress = event.progress;
        streamError = event.error;
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
  return { ok: true, progress, created };
}

export type BacklogMatch = {
  storyId: string;
  storyText: string;
  kind: 'duplicate' | 'related';
  score: number;
  existing: { id: string; title: string; description?: string; url: string; key?: string };
};

export async function apiBacklogMatches(
  epics: Epic[],
  signal?: AbortSignal
): Promise<{ ok: true; scanned: number; limit: number; matches: BacklogMatch[] }> {
  return api('/api/export/backlog-matches', {
    method: 'POST',
    body: JSON.stringify({ epics }),
    signal,
  });
}

export async function apiGetTrackerSettings(): Promise<TrackerConfig | null> {
  const data = await api<{ config: TrackerConfig | null }>('/api/tracker/settings');
  return data.config;
}

export async function apiSaveTrackerSettings(config: TrackerConfig): Promise<TrackerConfig> {
  const data = await api<{ config: TrackerConfig }>('/api/tracker/settings', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  return data.config;
}

export async function apiTestTracker(config: TrackerConfig): Promise<string> {
  const data = await api<{ message: string }>('/api/tracker/test', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  return data.message;
}

export async function apiGetHistory(): Promise<HistoryItem[]> {
  const data = await api<{
    items: Array<{ id: string; title: string; date: string; data: Epic[] }>;
  }>('/api/history');
  return data.items.map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date,
    data: item.data,
  }));
}

export async function apiDeleteHistoryItem(id: string): Promise<void> {
  await api(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function apiClearHistory(): Promise<void> {
  await api('/api/history', { method: 'DELETE' });
}
