/**
 * Prompt #251C browser smoke — reported poll presentation at staff viewports.
 *
 * Usage:
 *   npx serve app -l 8765
 *   node worker/scripts/moderation-report-control-251c-browser.mjs http://127.0.0.1:8765
 */
const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');
const viewports = [
  { name: '1366x720', width: 1366, height: 720 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x568', width: 320, height: 568 },
];

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}

let chromium;
try {
  ({ chromium } = await import('../../e2e/studio-contribute/node_modules/playwright/index.mjs'));
} catch (e) {
  bad('playwright unavailable', e && e.message);
  process.exit(1);
}

const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(base + '/dev/moderation-report-control-251c-harness.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true, { timeout: 10000 });
  const title = await page.locator('.title').innerText();
  const meta = await page.locator('.meta').innerText();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (/Favorite lunch/.test(title) && /Lucas R/.test(meta) && /4 reports/.test(meta) && !overflow) {
    ok(vp.name + ' human-readable reported poll row, no horizontal overflow');
  } else {
    bad(vp.name + ' layout/content', { title, meta, overflow });
  }
  await page.close();
}
await browser.close();

console.log('\n#251C browser:', pass, 'pass,', fail, 'fail');
process.exit(fail ? 1 : 0);
