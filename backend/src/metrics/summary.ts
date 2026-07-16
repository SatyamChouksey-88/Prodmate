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

  // Single round-trip for the three action COUNTs (behavior-identical to prior queries).
  const counts = await query<{
    export_count: string;
    generate_count: string;
    edit_count: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE action = 'export')::text AS export_count,
       COUNT(*) FILTER (WHERE action = 'generate')::text AS generate_count,
       COUNT(*) FILTER (WHERE action = 'review.edit')::text AS edit_count
     FROM audit_logs
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
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

  // True Gemini wall time from generate audit metadata.durationMs (not full-cycle).
  const geminiDurations = await query<{ avg_ms: string | null; sample_size: string }>(
    `SELECT
       AVG((metadata->>'durationMs')::double precision)::text AS avg_ms,
       COUNT(*)::text AS sample_size
     FROM audit_logs
     WHERE user_id = $1 AND action = 'generate'
       AND created_at >= $2 AND created_at <= $3
       AND metadata ? 'durationMs'
       AND (metadata->>'durationMs') ~ '^[0-9]+(\\.[0-9]+)?$'`,
    [userId, fromIso, toIso]
  );
  const geminiSample = Number(geminiDurations.rows[0]?.sample_size ?? 0);
  const avgGeminiMs =
    geminiSample > 0 && geminiDurations.rows[0]?.avg_ms != null
      ? Math.round(Number(geminiDurations.rows[0].avg_ms))
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

  const row = counts.rows[0];

  return {
    ok: true,
    range: { from: fromIso, to: toIso },
    metrics: [
      {
        id: 'export_count',
        label: 'Exports completed',
        value: Number(row?.export_count ?? 0),
        kind: 'measured' as const,
        how: "COUNT of audit_logs where action = 'export' in range",
      },
      {
        id: 'generate_count',
        label: 'Generations completed',
        value: Number(row?.generate_count ?? 0),
        kind: 'measured' as const,
        how: "COUNT of audit_logs where action = 'generate' in range",
      },
      {
        id: 'generate_duration_ms',
        label: 'Avg Gemini generate duration (ms)',
        value: avgGeminiMs,
        kind: 'measured' as const,
        how: "Mean of audit_logs.metadata.durationMs on action='generate' — server-measured LLM time only, not button-to-export",
        sampleSize: geminiSample > 0 ? geminiSample : undefined,
      },
      {
        id: 'generate_to_export_ms',
        label: 'Avg full-cycle generate→export time (ms)',
        value: avgGenerateToExportMs,
        kind: 'measured' as const,
        how: 'Mean of (export.created_at − generate.created_at) joined on metadata.generationId; only paired rows — includes review idle time',
        sampleSize: msValues.length,
      },
      {
        id: 'review_edit_proxy',
        label: 'Review/refine edits',
        value: Number(row?.edit_count ?? 0),
        kind: 'proxy' as const,
        how: "COUNT of audit_logs where action = 'review.edit' (editKind 'field' = manual Draft blur; 'refine' = LLM refine) — refinement-effort proxy, not wall-clock editing time",
      },
    ],
    recentActions: recent.rows,
  };
}
