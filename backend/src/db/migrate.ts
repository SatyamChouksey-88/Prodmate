import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
