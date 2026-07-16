/**
 * Isolation smoke for Phase 4 (D9 user_id scoping).
 *
 * Requires a running backend + migrated Postgres and env loaded.
 * Usage (from backend/):
 *   npx tsx scripts/isolation-smoke.ts
 *
 * If DATABASE_URL / secrets are missing, the script exits with instructions.
 * Inserts generations directly for user A, then checks GET /api/history as B.
 */
import 'dotenv/config';

const BASE = process.env.SMOKE_API_URL || 'http://127.0.0.1:4000';

type Jar = Map<string, string>;

function storeCookies(jar: Jar, res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  // fallback for environments without getSetCookie
  const single = res.headers.get('set-cookie');
  if (single && raw.length === 0) {
    const [pair] = single.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(
  jar: Jar,
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(jar),
      ...(init.headers || {}),
    },
  });
  storeCookies(jar, res);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`Backend not reachable at ${BASE}. Start it first (npm run migrate && npm run dev).`);
    process.exit(1);
  }

  const suffix = Date.now();
  const emailA = `phase4-a-${suffix}@example.com`;
  const emailB = `phase4-b-${suffix}@example.com`;
  const password = 'password12';

  const jarA: Jar = new Map();
  const jarB: Jar = new Map();

  const regA = await req(jarA, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: emailA,
      password,
      name: 'User A',
      role: 'Product Owner',
    }),
  });
  if (regA.status !== 200) {
    console.error('Register A failed', regA);
    process.exit(1);
  }
  const userA = (regA.json as { user: { id: string } }).user;

  const regB = await req(jarB, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: emailB,
      password,
      name: 'User B',
      role: 'Product Owner',
    }),
  });
  if (regB.status !== 200) {
    console.error('Register B failed', regB);
    process.exit(1);
  }

  // Insert a generation for A via SQL-less path: use pool if available
  const { pool } = await import('../src/db/pool.js');
  await pool.query(
    `INSERT INTO generations (user_id, title, result_json)
     VALUES ($1, $2, $3::jsonb)`,
    [
      userA.id,
      'SECRET-EPIC-FOR-A-ONLY',
      JSON.stringify([{ epic: 'SECRET-EPIC-FOR-A-ONLY', epic_description: 'x', features: [] }]),
    ]
  );

  const histB = await req(jarB, '/api/history');
  const histA = await req(jarA, '/api/history');

  const itemsB = (histB.json as { items: Array<{ title: string }> }).items || [];
  const itemsA = (histA.json as { items: Array<{ title: string }> }).items || [];

  const leaked = itemsB.some((i) => i.title === 'SECRET-EPIC-FOR-A-ONLY');
  const aHasOwn = itemsA.some((i) => i.title === 'SECRET-EPIC-FOR-A-ONLY');

  console.log('B history count:', itemsB.length, 'leaked A title?', leaked);
  console.log('A history count:', itemsA.length, 'has own title?', aHasOwn);

  await pool.end();

  if (leaked || !aHasOwn || histB.status !== 200 || histA.status !== 200) {
    console.error('ISOLATION CHECK FAILED');
    process.exit(1);
  }

  // Tracker settings isolation: save as A, B should not see A's provider details as owned
  await req(jarA, '/api/tracker/settings', {
    method: 'PUT',
    body: JSON.stringify({
      provider: 'azure-devops',
      orgUrl: 'https://dev.azure.com/org-a-only',
      project: 'ProjectA',
      pat: 'pat-secret-a',
    }),
  });
  const settingsB = await req(jarB, '/api/tracker/settings');
  const configB = (settingsB.json as { config: { orgUrl?: string } | null }).config;
  if (configB?.orgUrl === 'https://dev.azure.com/org-a-only') {
    console.error('Tracker settings leaked to B');
    process.exit(1);
  }

  console.log('ISOLATION CHECK PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
