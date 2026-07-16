/**
 * Delete audit_logs older than AUDIT_RETENTION_DAYS (default 90).
 * Usage: npm run audit:prune
 */
import { config } from '../src/config.js';
import { pool } from '../src/db/pool.js';

async function main() {
  const days = config.auditRetentionDays;
  const result = await pool.query(
    `DELETE FROM audit_logs WHERE created_at < now() - ($1::text || ' days')::interval`,
    [String(days)]
  );
  console.log(`Pruned ${result.rowCount ?? 0} audit_logs older than ${days} days.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
