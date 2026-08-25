/**
 * Prompt #262C browser smoke.
 * Usage: node worker/scripts/restricted-mode-262c-browser.mjs http://127.0.0.1:60156
 */
const base = (process.argv[2] || 'http://127.0.0.1:60156').replace(/\/$/, '');
const viewports = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x568', width: 320, height: 568 },
];
let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }

const { chromium } = await import('../../e2e/studio-contribute/node_modules/playwright/index.mjs');
const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(base + '/dev/restricted-mode-262c-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HARNESS_262C__ === true);
  const s = await page.evaluate(() => ({
    ready: window.__HARNESS_262C__ === true,
    locked: window.__HARNESS_262C_LOCKED__ === true,
    admin: window.__HARNESS_262C_ADMIN__ === true,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    scrollOk: document.documentElement.scrollHeight >= document.documentElement.clientHeight,
  }));
  if (s.ready && s.locked && s.admin) ok(vp.name + ' harness ready');
  else bad(vp.name + ' harness', s);
  if (!s.overflow) ok(vp.name + ' no overflow');
  else bad(vp.name + ' overflow');
  if (s.scrollOk) ok(vp.name + ' natural scroll');
  else bad(vp.name + ' scroll');
  await page.close();
}
await browser.close();
console.log('\n#262C browser:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
