import { query } from '../db/pool.js';

export async function writeAudit(
  userId: string,
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
