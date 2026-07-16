/**
 * Phase 2 live generate + export smoke against real ADO and Jira.
 *
 * Requires backend running + .env with:
 *   GEMINI_API_KEY (real)
 *   ADO_ORG_URL, ADO_PROJECT, ADO_PAT
 *   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
 *
 * Usage: npx tsx scripts/live-export-smoke.ts
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

async function req(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(jar),
      ...(init.headers || {}),
    },
  });
  storeCookies(jar, res);
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name} for live export smoke`);
  return v;
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`Backend not reachable at ${BASE}`);
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('REPLACE_')) {
    console.error('Set a real GEMINI_API_KEY in backend/.env before live generate.');
    process.exit(1);
  }

  const jar: Jar = new Map();
  const suffix = Date.now();
  const email = `live-export-${suffix}@example.com`;
  const password = 'password12';

  const reg = await req(jar, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      name: 'Live Export User',
      role: 'Product Owner',
    }),
  });
  if (reg.status !== 200) {
    console.error('Register failed', reg.status, reg.text);
    process.exit(1);
  }
  console.log('Registered', email);

  const requirement =
    'Build a tiny internal lunch-order form for one office floor. Need: list today menu, pick one item, submit. Keep backlog small (1 epic, 1-2 features, few stories).';

  console.log('Calling POST /api/generate…');
  const gen = await req(jar, '/api/generate', {
    method: 'POST',
    body: JSON.stringify({ requirement, knowledgeBase: '' }),
  });
  console.log('Generate status:', gen.status);
  console.log('Generate body (truncated):', JSON.stringify(gen.json, null, 2).slice(0, 2000));
  if (gen.status !== 200) {
    console.error('Generate failed');
    process.exit(1);
  }

  const { generationId, epics } = gen.json as {
    generationId: string;
    epics: unknown[];
  };

  // --- ADO ---
  const adoConfig = {
    provider: 'azure-devops',
    orgUrl: need('ADO_ORG_URL'),
    project: need('ADO_PROJECT'),
    pat: need('ADO_PAT'),
  };

  console.log('\nSaving ADO tracker settings + connection test…');
  const saveAdo = await req(jar, '/api/tracker/settings', {
    method: 'PUT',
    body: JSON.stringify(adoConfig),
  });
  console.log('ADO settings status:', saveAdo.status, JSON.stringify(saveAdo.json));

  const testAdo = await req(jar, '/api/tracker/test', {
    method: 'POST',
    body: JSON.stringify(adoConfig),
  });
  console.log('ADO test status:', testAdo.status, JSON.stringify(testAdo.json));

  console.log('Exporting to ADO…');
  const exportAdo = await req(jar, '/api/export', {
    method: 'POST',
    body: JSON.stringify({ epics, generationId }),
  });
  console.log('ADO export status:', exportAdo.status);
  console.log('ADO export body:', JSON.stringify(exportAdo.json, null, 2));
  if (exportAdo.status !== 200) {
    console.error('ADO export FAILED');
    process.exit(1);
  }
  const adoCreated = (exportAdo.json as { created?: Array<{ id: string; url: string }> }).created;
  console.log('ADO created items:', adoCreated);

  // --- Jira ---
  const jiraConfig = {
    provider: 'jira',
    baseUrl: need('JIRA_BASE_URL'),
    email: need('JIRA_EMAIL'),
    apiToken: need('JIRA_API_TOKEN'),
    projectKey: need('JIRA_PROJECT_KEY'),
  };

  console.log('\nSaving Jira tracker settings + connection test…');
  const saveJira = await req(jar, '/api/tracker/settings', {
    method: 'PUT',
    body: JSON.stringify(jiraConfig),
  });
  console.log('Jira settings status:', saveJira.status, JSON.stringify(saveJira.json));

  const testJira = await req(jar, '/api/tracker/test', {
    method: 'POST',
    body: JSON.stringify(jiraConfig),
  });
  console.log('Jira test status:', testJira.status, JSON.stringify(testJira.json));

  console.log('Exporting to Jira…');
  const exportJira = await req(jar, '/api/export', {
    method: 'POST',
    body: JSON.stringify({ epics, generationId }),
  });
  console.log('Jira export status:', exportJira.status);
  console.log('Jira export body:', JSON.stringify(exportJira.json, null, 2));
  if (exportJira.status !== 200) {
    console.error('Jira export FAILED');
    process.exit(1);
  }
  const jiraCreated = (exportJira.json as { created?: Array<{ id: string; url: string; key?: string }> }).created;
  console.log('Jira created items:', jiraCreated);

  console.log('\nLIVE EXPORT SMOKE PASSED (ADO + Jira)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
