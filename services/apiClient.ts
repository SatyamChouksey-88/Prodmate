import type { User } from '../types';
import type { Epic } from '../types';
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
  knowledgeBase: string
): Promise<{ generationId: string; epics: Epic[] }> {
  return api('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ requirement, knowledgeBase }),
  });
}

export async function apiExport(epics: Epic[], generationId?: string): Promise<void> {
  await api('/api/export', {
    method: 'POST',
    body: JSON.stringify({ epics, generationId }),
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
