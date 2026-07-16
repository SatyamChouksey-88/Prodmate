/**
 * Phase 12 collab/notes isolation: assertOwnsGeneration gates every route.
 * Includes the batch GET /notes endpoint in the same suite so it never ships
 * without a cross-user 404 guarantee.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '../../.data/pg-test-collab-isolation');
const port = 55433;
const SESSION_COOKIE = 'prodmate_session';

describe('collab/notes isolation (user_id via generation ownership)', () => {
  let pgServer: EmbeddedPostgres;
  let pool: pg.Pool;
  let userA: string;
  let userB: string;
  let genA: string;
  let sessionA: string;
  let sessionB: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fs.rmSync(databaseDir, { recursive: true, force: true });
    fs.mkdirSync(databaseDir, { recursive: true });

    pgServer = new EmbeddedPostgres({
      databaseDir,
      user: 'prodmate',
      password: 'prodmate',
      port,
      persistent: false,
    });
    await pgServer.initialise();
    await pgServer.start();
    try {
      await pgServer.createDatabase('prodmate');
    } catch {
      /* may exist */
    }

    process.env.DATABASE_URL = `postgres://prodmate:prodmate@127.0.0.1:${port}/prodmate`;
    process.env.GEMINI_API_KEY = 'test-key-not-used';
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars!!';
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    vi.resetModules();
    const { pool: appPool } = await import('../db/pool.js');
    pool = appPool;

    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema_phase4.sql'), 'utf8'));
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema_phase8.sql'), 'utf8'));
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema_phase12.sql'), 'utf8'));

    const a = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('collab-a@example.com', 'x', 'A', 'Product Owner') RETURNING id`
    );
    const b = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('collab-b@example.com', 'x', 'B', 'Product Owner') RETURNING id`
    );
    userA = a.rows[0].id;
    userB = b.rows[0].id;

    const g = await pool.query<{ id: string }>(
      `INSERT INTO generations (user_id, title, result_json)
       VALUES ($1, 'A-ONLY', $2::jsonb) RETURNING id`,
      [userA, JSON.stringify([{ epic: 'E', epic_description: '', features: [] }])]
    );
    genA = g.rows[0].id;

    await pool.query(
      `INSERT INTO generation_story_notes (generation_id, story_id, author_user_id, body)
       VALUES ($1, 'US1', $2, 'secret note for A')`,
      [genA, userA]
    );
    await pool.query(
      `INSERT INTO generation_story_collab (generation_id, story_id, assignee_label)
       VALUES ($1, 'US1', 'Alex')`,
      [genA]
    );

    const { createSession } = await import('../auth/session.js');
    sessionA = await createSession(userA);
    sessionB = await createSession(userB);

    const { collabRoutes } = await import('./collab.js');
    app = Fastify();
    await app.register(cookie, { secret: process.env.SESSION_SECRET });
    await collabRoutes(app);
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore */
    }
    try {
      await pool?.end();
    } catch {
      /* ignore */
    }
    try {
      await pgServer?.stop();
    } catch {
      /* ignore */
    }
    fs.rmSync(databaseDir, { recursive: true, force: true });
  });

  it('owner can batch-list notes and collab for their generation', async () => {
    const notesRes = await app.inject({
      method: 'GET',
      url: `/api/generations/${genA}/notes`,
      cookies: { [SESSION_COOKIE]: sessionA },
    });
    expect(notesRes.statusCode).toBe(200);
    const notesBody = notesRes.json() as { notes: Array<{ body: string; storyId: string }> };
    expect(notesBody.notes).toHaveLength(1);
    expect(notesBody.notes[0].body).toBe('secret note for A');
    expect(notesBody.notes[0].storyId).toBe('US1');

    const collabRes = await app.inject({
      method: 'GET',
      url: `/api/generations/${genA}/collab`,
      cookies: { [SESSION_COOKIE]: sessionA },
    });
    expect(collabRes.statusCode).toBe(200);
    const collabBody = collabRes.json() as { items: Array<{ assigneeLabel: string }> };
    expect(collabBody.items[0].assigneeLabel).toBe('Alex');
  });

  it('other user gets 404 on batch notes (new endpoint) and cannot read A data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/generations/${genA}/notes`,
      cookies: { [SESSION_COOKIE]: sessionB },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Generation not found' });
  });

  it('other user gets 404 on per-story notes GET and cannot mutate via POST', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/generations/${genA}/stories/US1/notes`,
      cookies: { [SESSION_COOKIE]: sessionB },
    });
    expect(getRes.statusCode).toBe(404);

    const postRes = await app.inject({
      method: 'POST',
      url: `/api/generations/${genA}/stories/US1/notes`,
      cookies: { [SESSION_COOKIE]: sessionB },
      headers: { 'content-type': 'application/json' },
      payload: { body: 'B trying to write' },
    });
    expect(postRes.statusCode).toBe(404);

    const still = await pool.query(
      `SELECT body FROM generation_story_notes WHERE generation_id = $1`,
      [genA]
    );
    expect(still.rows).toHaveLength(1);
    expect(still.rows[0].body).toBe('secret note for A');
  });

  it('other user gets 404 on collab GET and PATCH', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/generations/${genA}/collab`,
      cookies: { [SESSION_COOKIE]: sessionB },
    });
    expect(getRes.statusCode).toBe(404);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/generations/${genA}/stories/US1/collab`,
      cookies: { [SESSION_COOKIE]: sessionB },
      headers: { 'content-type': 'application/json' },
      payload: { assigneeLabel: 'Hacker' },
    });
    expect(patchRes.statusCode).toBe(404);

    const still = await pool.query(
      `SELECT assignee_label FROM generation_story_collab WHERE generation_id = $1`,
      [genA]
    );
    expect(still.rows[0].assignee_label).toBe('Alex');
  });
});
