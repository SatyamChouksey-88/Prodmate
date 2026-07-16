import bcrypt from 'bcrypt';

/** bcrypt work factor — Phase 3 locked choice (cost ≥ 12). */
export const BCRYPT_COST = 12;

/**
 * Fixed cost-12 hash of a constant string. Used only so login always runs
 * bcrypt.compare even when the email is unknown (timing side-channel fix).
 * Precomputed — do not regenerate at request time.
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$12$F4YN/AY4E7qizYdU8jIxneixot4Plf8aRA.zy.YPBRnKpHw/J35SK';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
