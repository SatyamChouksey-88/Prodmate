import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { writeAudit } from '../audit/log.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  pruneExpiredSessions,
  requireAuth,
  setSessionCookie,
  SESSION_COOKIE,
} from './session.js';

const roleSchema = z.enum(['Product Owner', 'Business Analyst', 'Scrum Master']);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  role: roleSchema.default('Product Owner'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, password, name, role } = parsed.data;
    const passwordHash = await hashPassword(password);

    try {
      const result = await query<{ id: string; email: string; name: string; role: string }>(
        `INSERT INTO users (email, password_hash, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role`,
        [email.toLowerCase(), passwordHash, name, role]
      );
      const user = result.rows[0];
      const sessionId = await createSession(user.id);
      setSessionCookie(reply, sessionId);
      await writeAudit(user.id, 'auth.register', { email: user.email });
      return { user };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        return reply.code(409).send({ error: 'Email already registered' });
      }
      throw err;
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const result = await query<{
      id: string;
      email: string;
      name: string;
      role: string;
      password_hash: string;
    }>(`SELECT id, email, name, role, password_hash FROM users WHERE email = $1`, [
      normalizedEmail,
    ]);
    const row = result.rows[0];

    // Always bcrypt-compare (dummy hash when user missing) — closes timing side-channel.
    const passwordOk = await verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!row || !passwordOk) {
      await writeAudit(row?.id ?? null, 'auth.login.failure', {
        email: normalizedEmail,
      });
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const sessionId = await createSession(row.id);
    setSessionCookie(reply, sessionId);
    await writeAudit(row.id, 'auth.login', { email: row.email });
    // Opportunistic: keep sessions table from growing unbounded (also via npm run audit:prune).
    void pruneExpiredSessions().catch((err) => {
      console.error('pruneExpiredSessions failed', err);
    });
    return {
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) {
      const sess = await query<{ user_id: string }>(
        `SELECT user_id FROM sessions WHERE id = $1`,
        [sessionId]
      );
      if (sess.rows[0]) {
        await writeAudit(sess.rows[0].user_id, 'auth.logout', {});
      }
      await destroySession(sessionId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.user };
  });
}
