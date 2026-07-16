import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
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
    const result = await query<{
      id: string;
      email: string;
      name: string;
      role: string;
      password_hash: string;
    }>(`SELECT id, email, name, role, password_hash FROM users WHERE email = $1`, [
      email.toLowerCase(),
    ]);
    const row = result.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const sessionId = await createSession(row.id);
    setSessionCookie(reply, sessionId);
    return {
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) {
      await destroySession(sessionId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.user };
  });
}
