/**
 * Behavioral proof that pruneExpiredSessions deletes only expired rows.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '../../.data/pg-test-session-prune');
const port = 55435;

describe('pruneExpiredSessions (behavioral)', () => {
  let pgServer: EmbeddedPostgres;
  let pool: pg.Pool;
  let userId: string;
  const expiredId = '11111111-1111-1111-1111-111111111111';
  const validId = '22222222-2222-2222-2222-222222222222';

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

    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('prune@example.com', 'x', 'P', 'Product Owner') RETURNING id`
    );
    userId = u.rows[0].id;

    await pool.query(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ($1, $3, now() - interval '1 hour'),
         ($2, $3, now() + interval '1 day')`,
      [expiredId, validId, userId]
    );
  }, 120_000);

  afterAll(async () => {
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

  it('deletes expired session and keeps still-valid session', async () => {
    const { pruneExpiredSessions } = await import('./session.js');
    const removed = await pruneExpiredSessions();
    expect(removed).toBe(1);

    const rows = await pool.query<{ id: string }>(
      `SELECT id::text AS id FROM sessions WHERE user_id = $1 ORDER BY id`,
      [userId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(validId);
  });
});
