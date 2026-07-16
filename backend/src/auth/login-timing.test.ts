import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyPassword = vi.fn();
const writeAudit = vi.fn(async (..._args: unknown[]) => undefined);
const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));

vi.mock('../db/pool.js', () => ({
  query: (text: string, params?: unknown[]) => query(text, params),
}));

vi.mock('./session.js', () => ({
  SESSION_COOKIE: 'prodmate_session',
  createSession: vi.fn(async () => 'sess-1'),
  destroySession: vi.fn(async () => undefined),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('../audit/log.js', () => ({
  writeAudit: (...args: unknown[]) => writeAudit(...args),
}));

vi.mock('./password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password.js')>();
  return {
    ...actual,
    verifyPassword: (password: string, hash: string) => verifyPassword(password, hash),
  };
});

import { DUMMY_PASSWORD_HASH } from './password.js';
import { authRoutes } from './routes.js';

describe('login timing side-channel fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPassword.mockResolvedValue(false);
  });

  it('always compares against dummy hash when email is unknown', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const handlers: Record<string, (req: unknown, reply: unknown) => Promise<unknown>> = {};
    const app = {
      post: (path: string, handler: (req: unknown, reply: unknown) => Promise<unknown>) => {
        handlers[path] = handler;
      },
      get: () => undefined,
    };

    await authRoutes(app as never);

    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    await handlers['/api/auth/login'](
      { body: { email: 'missing@example.com', password: 'password12' } },
      reply
    );

    expect(verifyPassword).toHaveBeenCalledWith('password12', DUMMY_PASSWORD_HASH);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(writeAudit).toHaveBeenCalledWith(
      null,
      'auth.login.failure',
      expect.objectContaining({ email: 'missing@example.com' })
    );
  });

  it('dummy hash is a valid bcrypt hash that never matches random passwords', async () => {
    const bcrypt = await import('bcrypt');
    const ok = await bcrypt.compare('any-password', DUMMY_PASSWORD_HASH);
    expect(ok).toBe(false);
  });
});
