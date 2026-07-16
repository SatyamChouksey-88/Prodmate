import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
};

export function loadConfigLazy() {
  return config;
}
