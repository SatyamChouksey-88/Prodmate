import { query } from '../db/pool.js';

export type MetricsSummaryResult = {
  ok: true;
  range: { from: string; to: string };
  metrics: Array<{
    id: string;
    label: string;
    value: number | null;
    kind: 'measured' | 'proxy';
    how: string;
    sampleSize?: number;
  }>;
  recentActions: Array<{ action: string; metadata: unknown; created_at: string }>;
};

/**
 * Metrics aggregates for one user in [from, to]. Pure DB reads — used by the
 * route and by isolation/aggregate tests.
 */
export async function computeMetricsSummary(
  userId: string,
  from: Date,
  to: Date
): Promise<MetricsSummaryResult> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const exportCount = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs
     WHERE user_id = $1 AND action = 'export'
       AND created_at >= $2 AND created_at <= $3`,
    [userId, fromIso, toIso]
  );

  const generateCount = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs
     WHERE user_id = $1 AND action = 'generate'
       AND created_at >= $2 AND created_at <= $3`,
    [userId, fromIso, toIso]
  );

  const editProxy = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs
     WHERE user_id = $1 AND action = 'review.edit'
       AND created_at >= $2 AND created_at <= $3`,
    [userId, fromIso, toIso]
  );

  const durations = await query<{ duration_ms: number }>(
    `WITH gens AS (
       SELECT metadata->>'generationId' AS gid, created_at AS gen_at
       FROM audit_logs
       WHERE user_id = $1 AND action = 'generate'
         AND created_at >= $2 AND created_at <= $3
         AND metadata ? 'generationId'
     ),
     exps AS (
       SELECT metadata->>'generationId' AS gid, created_at AS exp_at
       FROM audit_logs
       WHERE user_id = $1 AND action = 'export'
         AND created_at >= $2 AND created_at <= $3
         AND metadata ? 'generationId'
     )
     SELECT EXTRACT(EPOCH FROM (e.exp_at - g.gen_at)) * 1000 AS duration_ms
     FROM gens g
     JOIN exps e ON e.gid = g.gid
     WHERE e.exp_at >= g.gen_at`,
    [userId, fromIso, toIso]
  );

  const msValues = durations.rows
    .map((r) => Number(r.duration_ms))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgGenerateToExportMs =
    msValues.length > 0
      ? Math.round(msValues.reduce((a, b) => a + b, 0) / msValues.length)
      : null;

  const recent = await query<{
    action: string;
    metadata: unknown;
    created_at: string;
  }>(
    `SELECT action, metadata, created_at::text
     FROM audit_logs
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY created_at DESC
     LIMIT 25`,
    [userId, fromIso, toIso]
  );

  return {
    ok: true,
    range: { from: fromIso, to: toIso },
    metrics: [
      {
        id: 'export_count',
        label: 'Exports completed',
        value: Number(exportCount.rows[0]?.count ?? 0),
        kind: 'measured' as const,
        how: "COUNT of audit_logs where action = 'export' in range",
      },
      {
        id: 'generate_count',
        label: 'Generations completed',
        value: Number(generateCount.rows[0]?.count ?? 0),
        kind: 'measured' as const,
        how: "COUNT of audit_logs where action = 'generate' in range",
      },
      {
        id: 'generate_to_export_ms',
        label: 'Avg generate→export time (ms)',
        value: avgGenerateToExportMs,
        kind: 'measured' as const,
        how: 'Mean of (export.created_at − generate.created_at) joined on metadata.generationId; only paired rows',
        sampleSize: msValues.length,
      },
      {
        id: 'review_edit_proxy',
        label: 'Review/refine edits',
        value: Number(editProxy.rows[0]?.count ?? 0),
        kind: 'proxy' as const,
        how: "COUNT of audit_logs where action = 'review.edit' (editKind 'field' = manual Draft blur; 'refine' = LLM refine) — refinement-effort proxy, not wall-clock editing time",
      },
    ],
    recentActions: recent.rows,
  };
}
