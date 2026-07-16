/**
 * Phase 7 cross-user retrieval isolation against real Postgres + pgvector.
 *
 * Gated on TEST_DATABASE_URL. Never runs against embedded-postgres (no vector extension).
 * If unavailable: Vitest skips the suite — that is NOT a green isolation proof.
 *
 * Setup (Docker):
 *   docker compose -f backend/docker-compose.yml up -d
 *   npm run migrate
 *   set TEST_DATABASE_URL=postgres://prodmate:prodmate@localhost:5432/prodmate
 *
 * Azure Flexible Server: allow-list extension `vector` via azure.extensions before migrate.
 *
 * Uses a dedicated pg.Pool (not the app singleton) so it does not race history isolation tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { l2Normalize, toPgVectorLiteral, EMBEDDING_DIMENSIONS } from '../services/embeddingMath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testUrl = process.env.TEST_DATABASE_URL?.trim();

function unitVector(seed: number): number[] {
  const raw = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(seed * 17 + i * 0.11));
  return l2Normalize(raw);
}

async function searchChunks(
  pool: pg.Pool,
  userId: string,
  queryEmbedding: number[],
  limit = 5
) {
  return pool.query<{ id: string; content: string }>(
    `SELECT id, document_id, content, (embedding <=> $2::vector) AS distance
     FROM knowledge_chunks
     WHERE user_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [userId, toPgVectorLiteral(queryEmbedding), limit]
  );
}

describe.runIf(Boolean(testUrl))('knowledge retrieval isolation (pgvector)', () => {
  let pool: pg.Pool;
  let userA: string;
  let userB: string;
  let docA: string;

  beforeAll(async () => {
    if (!testUrl) throw new Error('TEST_DATABASE_URL required');

    pool = new pg.Pool({ connectionString: testUrl });

    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (err) {
      throw new Error(
        `TEST_DATABASE_URL is set but CREATE EXTENSION vector failed. ` +
          `Use pgvector/pgvector (Docker) or Azure with azure.extensions including vector. ` +
          `Original: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const schema3 = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    const schema4 = fs.readFileSync(path.join(__dirname, '../db/schema_phase4.sql'), 'utf8');
    const schema8 = fs.readFileSync(path.join(__dirname, '../db/schema_phase8.sql'), 'utf8');
    const schema7 = fs.readFileSync(path.join(__dirname, '../db/schema_phase7.sql'), 'utf8');
    await pool.query(schema3);
    await pool.query(schema4);
    await pool.query(schema8);
    await pool.query(schema7);

    const stamp = Date.now();
    const a = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, 'x', 'A', 'Product Owner') RETURNING id`,
      [`knowledge-a-${stamp}@example.com`]
    );
    const b = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, 'x', 'B', 'Product Owner') RETURNING id`,
      [`knowledge-b-${stamp}@example.com`]
    );
    userA = a.rows[0].id;
    userB = b.rows[0].id;

    const doc = await pool.query<{ id: string }>(
      `INSERT INTO knowledge_documents (user_id, title, source_filename)
       VALUES ($1, 'SECRET-DOC-A', 'secret.md') RETURNING id`,
      [userA]
    );
    docA = doc.rows[0].id;

    await pool.query(
      `INSERT INTO knowledge_chunks (document_id, user_id, chunk_index, content, embedding)
       VALUES ($1, $2, 0, $3, $4::vector)`,
      [
        docA,
        userA,
        'SECRET_CHUNK_ONLY_FOR_USER_A payment stripe us-canada',
        toPgVectorLiteral(unitVector(1)),
      ]
    );

    const docB = await pool.query<{ id: string }>(
      `INSERT INTO knowledge_documents (user_id, title) VALUES ($1, 'public-b') RETURNING id`,
      [userB]
    );
    await pool.query(
      `INSERT INTO knowledge_chunks (document_id, user_id, chunk_index, content, embedding)
       VALUES ($1, $2, 0, $3, $4::vector)`,
      [docB.rows[0].id, userB, 'User B inventory notes', toPgVectorLiteral(unitVector(99))]
    );
  }, 60_000);

  afterAll(async () => {
    try {
      if (userA) await pool.query(`DELETE FROM users WHERE id = $1`, [userA]);
      if (userB) await pool.query(`DELETE FROM users WHERE id = $1`, [userB]);
    } catch {
      /* ignore cleanup errors */
    }
    try {
      await pool?.end();
    } catch {
      /* ignore */
    }
  });

  it('cosine search never returns another users chunks', async () => {
    // Same vector as A's secret — would be the top hit without user_id filter
    const hitsB = await searchChunks(pool, userB, unitVector(1), 5);
    expect(hitsB.rows.some((r) => r.content.includes('SECRET_CHUNK_ONLY_FOR_USER_A'))).toBe(false);

    const hitsA = await searchChunks(pool, userA, unitVector(1), 5);
    expect(hitsA.rows.some((r) => r.content.includes('SECRET_CHUNK_ONLY_FOR_USER_A'))).toBe(true);
  });

  it('cannot delete another users knowledge document', async () => {
    const del = await pool.query(
      `DELETE FROM knowledge_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
      [docA, userB]
    );
    expect(del.rowCount).toBe(0);
    const still = await pool.query(`SELECT id FROM knowledge_documents WHERE id = $1`, [docA]);
    expect(still.rowCount).toBe(1);
  });
});
