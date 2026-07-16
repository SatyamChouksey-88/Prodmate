/**
 * Start an embedded Postgres for local smoke tests (no Docker/admin required).
 * Keeps the process alive until Ctrl+C.
 *
 * Usage: npx tsx scripts/start-embedded-pg.ts
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(__dirname, '..', '.data', 'pg');
const port = Number(process.env.PG_PORT || 5432);
const user = 'prodmate';
const password = 'prodmate';
const database = 'prodmate';

async function main() {
  fs.mkdirSync(databaseDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
  });

  console.log(`Initialising embedded Postgres in ${databaseDir} on :${port}…`);
  await pg.initialise();
  await pg.start();

  try {
    await pg.createDatabase(database);
    console.log(`Database "${database}" ready.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg)) {
      console.log(`Database "${database}" already exists.`);
    } else {
      console.warn('createDatabase note:', msg);
    }
  }

  console.log(`DATABASE_URL=postgres://${user}:${password}@127.0.0.1:${port}/${database}`);
  console.log('Embedded Postgres is running. Leave this terminal open. Ctrl+C to stop.');

  const shutdown = async () => {
    console.log('\nStopping embedded Postgres…');
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
