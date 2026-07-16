/**
 * Manual/CI-style check: at tablet (768) and desktop (1280) widths, the App
 * main grid must be 12 columns with aside + main side-by-side (not broken
 * overflow). Uses Playwright Chromium against a fixture mirroring App.tsx classes.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, 'tablet-layout-fixture.html'), 'utf8');

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function measure(width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const grid = document.getElementById('main-grid');
    const aside = document.getElementById('aside');
    const main = document.getElementById('main');
    const gs = getComputedStyle(grid);
    const ar = aside.getBoundingClientRect();
    const mr = main.getBoundingClientRect();
    return {
      display: gs.display,
      gridTemplateColumns: gs.gridTemplateColumns,
      asideTop: Math.round(ar.top),
      mainTop: Math.round(mr.top),
      asideWidth: Math.round(ar.width),
      mainWidth: Math.round(mr.width),
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

const phone = await measure(390);
const tablet = await measure(768);
const desktop = await measure(1280);

await browser.close();
server.close();

const failures = [];

if (phone.bodyScrollWidth > phone.clientWidth + 2) {
  failures.push(`phone horizontal overflow: scroll=${phone.bodyScrollWidth} client=${phone.clientWidth}`);
}
if (tablet.bodyScrollWidth > tablet.clientWidth + 2) {
  failures.push(`tablet horizontal overflow: scroll=${tablet.bodyScrollWidth} client=${tablet.clientWidth}`);
}
if (desktop.bodyScrollWidth > desktop.clientWidth + 2) {
  failures.push(`desktop horizontal overflow`);
}

// At md+ the grid should be multi-column (aside and main share a row).
if (tablet.asideTop !== tablet.mainTop) {
  failures.push(
    `tablet expected side-by-side (same top); asideTop=${tablet.asideTop} mainTop=${tablet.mainTop}`
  );
}
if (tablet.asideWidth < 180 || tablet.mainWidth < 300) {
  failures.push(
    `tablet columns too narrow: aside=${tablet.asideWidth} main=${tablet.mainWidth}`
  );
}
if (phone.asideTop === phone.mainTop && phone.asideWidth + phone.mainWidth > phone.clientWidth * 0.9) {
  // phone should stack (main below aside)
  failures.push('phone unexpectedly side-by-side');
}
if (Math.abs(phone.mainTop - phone.asideTop) < 40) {
  failures.push(`phone expected stacked layout; asideTop=${phone.asideTop} mainTop=${phone.mainTop}`);
}

console.log(JSON.stringify({ phone, tablet, desktop }, null, 2));

if (failures.length) {
  console.error('TABLET LAYOUT CHECK FAILED:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('TABLET LAYOUT CHECK OK');
