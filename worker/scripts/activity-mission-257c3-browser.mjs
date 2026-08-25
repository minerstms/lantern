/**
 * Prompt #257C3 browser QA — verified activity completion copy.
 * Usage: npx serve app -l 8765 && node worker/scripts/activity-mission-257c3-browser.mjs http://127.0.0.1:8765
 */
const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');
const viewports = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
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

const { chromium } = await import('../../e2e/studio-contribute/node_modules/playwright/index.mjs');
const browser = await chromium.launch();
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(base + '/dev/activity-mission-257c3-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true);
  const s = await page.evaluate(() => ({
    verified: window.__HARNESS_HAS_VERIFIED_ADMIN__,
    staff: window.__HARNESS_HAS_STAFF_ADMIN__,
    noPending: window.__HARNESS_NO_PENDING_REVIEW__,
    copy: window.__HARNESS_COMPLETION_COPY__,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  if (s.verified) ok(vp.name + ' verified admin label');
  else bad(vp.name + ' verified admin');
  if (s.noPending && s.copy.includes('Challenge complete')) ok(vp.name + ' no pending review copy');
  else bad(vp.name + ' completion copy', s);
  if (!s.overflow) ok(vp.name + ' no horizontal overflow');
  else bad(vp.name + ' overflow');
  await page.close();
}
await browser.close();
console.log('\n#257C3 browser:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
