import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { query } from '../db/pool.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'prodmate_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'Product Owner' | 'Business Analyst' | 'Scrum Master';
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function createSession(userId: string): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [id, userId, expiresAt.toISOString()]
  );
  return id;
}

export async function destroySession(sessionId: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}

/** Delete expired session rows (cron + opportunistic login prune). */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await query(`DELETE FROM sessions WHERE expires_at < now()`);
  return result.rowCount ?? 0;
}

export async function loadUserFromSession(sessionId: string): Promise<AuthUser | null> {
  const result = await query<{
    id: string;
    email: string;
    name: string;
    role: AuthUser['role'];
  }>(
    `SELECT u.id, u.email, u.name, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (!sessionId) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const user = await loadUserFromSession(sessionId);
  if (!user) {
    clearSessionCookie(reply);
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  request.user = user;
}
