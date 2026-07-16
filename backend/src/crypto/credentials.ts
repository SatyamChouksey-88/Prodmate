import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Encrypt tracker credentials at rest with AES-256-GCM.
 *
 * Key source (Phase 3): CREDENTIALS_ENCRYPTION_KEY env var — base64-encoded 32 bytes.
 * Trade-off: fine for internal deploy; Azure Key Vault is Phase 8 hardening, not blocking.
 */
function getKey(): Buffer {
  const raw = Buffer.from(config.credentialsEncryptionKey, 'base64');
  if (raw.length !== 32) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be base64-encoded 32 bytes (AES-256). ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  return raw;
}

export function encryptJson(payload: unknown): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: iv.ciphertext.tag (all base64)
  return `${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`;
}

export function decryptJson<T>(ciphertext: string): T {
  const key = getKey();
  const [ivB64, dataB64, tagB64] = ciphertext.split('.');
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
