import { query } from '../db/pool.js';

/**
 * Persist an audit event. `userId` may be null for unauthenticated failures
 * (e.g. login with unknown email) after Phase 8 schema change.
 */
export async function writeAudit(
  userId: string | null,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3::jsonb)`,
      [userId, action, JSON.stringify(metadata)]
    );
  } catch (err) {
    // Never fail the primary request because of audit write issues
    console.error('writeAudit failed', action, err);
  }
}
