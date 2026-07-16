/**
 * Phase 4 isolation: generations are scoped by user_id (D9).
 * Runs against embedded Postgres so the SQL contract is real, not mocked away.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '../../.data/pg-test-isolation');
const port = 55432;

describe('history isolation (user_id scoping)', () => {
  let pgServer: EmbeddedPostgres;
  let pool: pg.Pool;
  let userA: string;
  let userB: string;
  let genA: string;

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

    // Dynamic import after env is set so pool picks up DATABASE_URL
    const { pool: appPool } = await import('../db/pool.js');
    pool = appPool;

    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    const schema3 = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    const schema4 = fs.readFileSync(path.join(__dirname, '../db/schema_phase4.sql'), 'utf8');
    await pool.query(schema3);
    await pool.query(schema4);

    const a = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('a@example.com', 'x', 'A', 'Product Owner') RETURNING id`
    );
    const b = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('b@example.com', 'x', 'B', 'Product Owner') RETURNING id`
    );
    userA = a.rows[0].id;
    userB = b.rows[0].id;

    const g = await pool.query<{ id: string }>(
      `INSERT INTO generations (user_id, title, result_json)
       VALUES ($1, 'SECRET-FOR-A', $2::jsonb) RETURNING id`,
      [userA, JSON.stringify([{ epic: 'SECRET-FOR-A', epic_description: '', features: [] }])]
    );
    genA = g.rows[0].id;
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

  it('listGenerationsForUser returns only that user rows', async () => {
    const { listGenerationsForUser } = await import('./queries.js');
    const forB = await listGenerationsForUser(userB);
    const forA = await listGenerationsForUser(userA);

    expect(forB.rows.some((r) => r.title === 'SECRET-FOR-A')).toBe(false);
    expect(forB.rows).toHaveLength(0);
    expect(forA.rows.some((r) => r.id === genA && r.title === 'SECRET-FOR-A')).toBe(true);
  });

  it('deleteGenerationForUser cannot delete another users row', async () => {
    const { deleteGenerationForUser, listGenerationsForUser } = await import('./queries.js');
    const del = await deleteGenerationForUser(userB, genA);
    expect(del.rowCount).toBe(0);

    const forA = await listGenerationsForUser(userA);
    expect(forA.rows.some((r) => r.id === genA)).toBe(true);
  });

  it('clearGenerationsForUser only clears the caller', async () => {
    const { clearGenerationsForUser, listGenerationsForUser } = await import('./queries.js');
    await clearGenerationsForUser(userB);
    const forA = await listGenerationsForUser(userA);
    expect(forA.rows.some((r) => r.id === genA)).toBe(true);
  });
});
