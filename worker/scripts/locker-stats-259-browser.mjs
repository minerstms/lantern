/**
 * Prompt #259 browser QA — Locker stats header at required viewports.
 * Usage:
 *   npx serve app -l 8765
 *   node worker/scripts/locker-stats-259-browser.mjs http://127.0.0.1:8765
 */
const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');
const viewports = [
  { name: '1366x768', width: 1366, height: 768 },
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
  await page.goto(base + '/dev/locker-stats-259-harness.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true, { timeout: 10000 });
  const state = await page.evaluate(() => ({
    hasStats: !!window.__HARNESS_HAS_STATS__,
    hasBio: !!window.__HARNESS_HAS_BIO__,
    overflow: !!window.__HARNESS_OVERFLOW__,
    text: window.__HARNESS_TEXT__ || '',
  }));
  if (state.hasStats) ok(vp.name + ' stats block visible');
  else bad(vp.name + ' stats missing');
  if (!state.hasBio) ok(vp.name + ' bio removed');
  else bad(vp.name + ' bio still present');
  if (state.text.includes('My Lantern Stats') && state.text.includes('Creations Shared')) ok(vp.name + ' labels');
  else bad(vp.name + ' labels', state.text.slice(0, 120));
  if (!state.overflow) ok(vp.name + ' no horizontal overflow');
  else bad(vp.name + ' overflow');
  await page.close();
}
await browser.close();
console.log('\n#259 browser: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
