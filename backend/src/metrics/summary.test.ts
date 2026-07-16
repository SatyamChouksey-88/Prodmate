/**
 * Phase 12 metrics aggregates: counts + generate→export JOIN, scoped by user_id.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '../../.data/pg-test-metrics');
const port = 55434;

describe('metrics summary aggregates (user-scoped)', () => {
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
       VALUES ('metrics-a@example.com', 'x', 'A', 'Product Owner') RETURNING id`
    );
    const b = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ('metrics-b@example.com', 'x', 'B', 'Product Owner') RETURNING id`
    );
    userA = a.rows[0].id;
    userB = b.rows[0].id;

    const g = await pool.query<{ id: string }>(
      `INSERT INTO generations (user_id, title, result_json)
       VALUES ($1, 'metrics-gen', '[]'::jsonb) RETURNING id`,
      [userA]
    );
    genA = g.rows[0].id;

    const t0 = new Date('2026-07-01T10:00:00.000Z');
    const t1 = new Date('2026-07-01T10:00:05.000Z'); // 5000ms later
    const t2 = new Date('2026-07-01T12:00:00.000Z');

    // User A: 2 generates (with Gemini durationMs), 1 export (paired), 2 review.edits
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, metadata, created_at) VALUES
         ($1, 'generate', $2::jsonb, $3),
         ($1, 'export', $2::jsonb, $4),
         ($1, 'generate', $5::jsonb, $6),
         ($1, 'review.edit', '{"editKind":"field"}'::jsonb, $6),
         ($1, 'review.edit', '{"editKind":"refine"}'::jsonb, $6)`,
      [
        userA,
        JSON.stringify({ generationId: genA, durationMs: 1200 }),
        t0.toISOString(),
        t1.toISOString(),
        JSON.stringify({ generationId: 'other', durationMs: 800 }),
        t2.toISOString(),
      ]
    );

    // User B noise — must not appear in A's summary
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, metadata, created_at) VALUES
         ($1, 'generate', '{"generationId":"b-gen","durationMs":3000}'::jsonb, $2),
         ($1, 'export', '{"generationId":"b-gen"}'::jsonb, $2),
         ($1, 'review.edit', '{}'::jsonb, $2)`,
      [userB, t2.toISOString()]
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

  it('aggregates counts and generate→export duration for caller only', async () => {
    const { computeMetricsSummary } = await import('../metrics/summary.js');
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-02T00:00:00.000Z');

    const forA = await computeMetricsSummary(userA, from, to);
    const byId = Object.fromEntries(forA.metrics.map((m) => [m.id, m]));

    expect(byId.export_count.value).toBe(1);
    expect(byId.generate_count.value).toBe(2);
    expect(byId.review_edit_proxy.value).toBe(2);
    expect(byId.generate_to_export_ms.value).toBe(5000);
    expect(byId.generate_to_export_ms.sampleSize).toBe(1);
    // Gemini duration: mean of 1200 and 800 — distinct from full-cycle 5000
    expect(byId.generate_duration_ms.value).toBe(1000);
    expect(byId.generate_duration_ms.sampleSize).toBe(2);
    expect(byId.generate_duration_ms.label).toMatch(/Gemini/i);
    expect(byId.generate_to_export_ms.label).toMatch(/full-cycle|generate→export/i);

    const forB = await computeMetricsSummary(userB, from, to);
    const bById = Object.fromEntries(forB.metrics.map((m) => [m.id, m]));
    expect(bById.export_count.value).toBe(1);
    expect(bById.generate_count.value).toBe(1);
    expect(bById.review_edit_proxy.value).toBe(1);
    // B's generate/export same timestamp → 0ms average
    expect(bById.generate_to_export_ms.value).toBe(0);
    expect(bById.generate_duration_ms.value).toBe(3000);
  });

  it('does not leak other users rows into recentActions', async () => {
    const { computeMetricsSummary } = await import('../metrics/summary.js');
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-02T00:00:00.000Z');
    const forA = await computeMetricsSummary(userA, from, to);
    expect(forA.recentActions.length).toBe(5);
    // All seeded A actions — none mention b-gen
    const blob = JSON.stringify(forA.recentActions);
    expect(blob).not.toContain('b-gen');
  });
});
