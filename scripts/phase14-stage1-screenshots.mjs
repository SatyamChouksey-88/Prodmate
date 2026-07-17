/**
 * Phase 14 Stage 1 — capture real app screenshots at 375 / 768 / 1280, light + dark.
 * Usage: node scripts/phase14-stage1-screenshots.mjs  (expects Vite on BASE_URL)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../.scratch/phase14-stage1-screens');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const widths = [375, 768, 1280];
const themes = ['light', 'dark'];

const seededHistory = [
  {
    id: 'seed-phase14',
    title: 'Checkout resilience',
    date: new Date().toLocaleString(),
    data: [
      {
        epic: 'Checkout resilience',
        epic_description: 'Keep shoppers moving when payment providers flake.',
        features: [
          {
            feature: 'Retry messaging',
            feature_description: 'Clear recovery copy after a soft decline.',
            user_stories: [
              {
                id: 'US1',
                story: 'As a shopper I want to retry payment without losing my cart',
                acceptance_criteria: ['Retry keeps cart items', 'Shows provider outage copy'],
                business_value: 'High',
                risk_impact: 'Medium',
                dependencies: [],
                story_points: 5,
              },
              {
                id: 'US2',
                story: 'As a PO I want declined attempts tagged for analytics',
                acceptance_criteria: ['Event includes decline code'],
                business_value: 'Medium',
                risk_impact: 'Low',
                dependencies: ['US1'],
                story_points: 3,
              },
            ],
          },
        ],
      },
    ],
  },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

async function shot(name, theme, width) {
  await page.setViewportSize({ width, height: width <= 400 ? 812 : 900 });
  await setTheme(theme);
  await page.waitForTimeout(200);
  const file = join(outDir, `${name}-${theme}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
}

// --- Login (demo mode; no VITE_API_URL) ---
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
});
await page.reload({ waitUntil: 'networkidle' });

for (const theme of themes) {
  for (const w of widths) {
    await shot('login', theme, w);
  }
}

// Seed history + login as demo user
await page.evaluate((hist) => {
  localStorage.setItem(
    'agile-gen-user',
    JSON.stringify({ name: 'Phase14 Reviewer', role: 'Product Owner' })
  );
  localStorage.setItem('agile-gen-history-Phase14 Reviewer', JSON.stringify(hist));
}, seededHistory);
await page.reload({ waitUntil: 'networkidle' });

// Dashboard / welcome with history aside
for (const theme of themes) {
  for (const w of widths) {
    await shot('dashboard', theme, w);
  }
}

// Open seeded history → review screen
const historyBtn = page.getByText('Checkout resilience').first();
if (await historyBtn.count()) {
  await historyBtn.click();
  await page.waitForTimeout(400);
} else {
  // History panel may be collapsed
  const histToggle = page.getByRole('button', { name: /history/i }).first();
  if (await histToggle.count()) await histToggle.click();
  await page.getByText('Checkout resilience').first().click();
  await page.waitForTimeout(400);
}

for (const theme of themes) {
  for (const w of widths) {
    await shot('review', theme, w);
  }
}

await browser.close();
console.log('done →', outDir);
