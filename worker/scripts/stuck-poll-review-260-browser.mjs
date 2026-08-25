/**
 * Prompt #260 browser smoke — poll review harness layout.
 * Usage: npx serve app -l 8767 && node worker/scripts/stuck-poll-review-260-browser.mjs http://127.0.0.1:PORT
 */
const base = (process.argv[2] || 'http://127.0.0.1:8767').replace(/\/$/, '');
const viewports = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];
let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log('PASS', m);
}
function bad(m, d) {
  fail++;
  console.error('FAIL', m, d != null ? d : '');
}

const { chromium } = await import('../../e2e/studio-contribute/node_modules/playwright/index.mjs');
const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(base + '/dev/stuck-poll-review-260-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true);
  const s = await page.evaluate(() => ({
    stale: window.__HARNESS_STALE_HIDDEN__,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  if (s.stale) ok(vp.name + ' harness ready');
  else bad(vp.name + ' harness');
  if (!s.overflow) ok(vp.name + ' no overflow');
  else bad(vp.name + ' overflow');
  await page.close();
}
await browser.close();
console.log('\n#260 browser:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
