import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  const phase3 = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(phase3);
  const phase4 = fs.readFileSync(path.join(__dirname, 'schema_phase4.sql'), 'utf8');
  await pool.query(phase4);
  const phase8 = fs.readFileSync(path.join(__dirname, 'schema_phase8.sql'), 'utf8');
  await pool.query(phase8);
  const phase7 = fs.readFileSync(path.join(__dirname, 'schema_phase7.sql'), 'utf8');
  await pool.query(phase7);
  console.log('Migration complete (phase 3 + 4 + 8 + 7).');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
