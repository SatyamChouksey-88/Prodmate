import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  databaseUrl: required('DATABASE_URL'),
  geminiApiKey: required('GEMINI_API_KEY'),
  sessionSecret: required('SESSION_SECRET'),
  /**
   * AES-256-GCM key for tracker credentials at rest.
   * Phase 3: env var only (internal project). Azure Key Vault = later hardening.
   */
  credentialsEncryptionKey: required('CREDENTIALS_ENCRYPTION_KEY'),
  /** Per-user generate cap per hour (Gemini cost control). */
  rateLimitGenerateMax: optionalInt('RATE_LIMIT_GENERATE_PER_HOUR', 10),
  /** Per-user export cap per hour. */
  rateLimitExportMax: optionalInt('RATE_LIMIT_EXPORT_PER_HOUR', 30),
  /** Soft retention for audit_logs; pruned via `npm run audit:prune`. */
  auditRetentionDays: optionalInt('AUDIT_RETENTION_DAYS', 90),
};

export function loadConfigLazy() {
  return config;
}
