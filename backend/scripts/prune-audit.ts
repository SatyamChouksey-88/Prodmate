/**
 * Maintenance prune (Phase 8 audit retention + Round 2 session expiry).
 * Usage: npm run audit:prune
 *
 * - audit_logs older than AUDIT_RETENTION_DAYS (default 90)
 * - sessions where expires_at < now()
 */
import { config } from '../src/config.js';
import { pool } from '../src/db/pool.js';

async function main() {
  const days = config.auditRetentionDays;
  const audit = await pool.query(
    `DELETE FROM audit_logs WHERE created_at < now() - ($1::text || ' days')::interval`,
    [String(days)]
  );
  console.log(`Pruned ${audit.rowCount ?? 0} audit_logs older than ${days} days.`);

  const sessions = await pool.query(`DELETE FROM sessions WHERE expires_at < now()`);
  console.log(`Pruned ${sessions.rowCount ?? 0} expired sessions.`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
