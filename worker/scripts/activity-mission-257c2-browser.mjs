/**
 * Prompt #257C2 browser QA — reward mode admin + student copy at required viewports.
 * Usage:
 *   npx serve app -l 8765
 *   node worker/scripts/activity-mission-257c2-browser.mjs http://127.0.0.1:8765
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
  await page.goto(base + '/dev/activity-mission-257c2-harness.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true, { timeout: 10000 });

  const state = await page.evaluate(() => ({
    hasRewardMode: !!window.__HARNESS_HAS_REWARD_MODE__,
    hasEvery: !!window.__HARNESS_HAS_EVERY__,
    overflow: !!window.__HARNESS_OVERFLOW__,
    studentMeta: document.getElementById('studentMissionMeta').textContent,
    repeatable: document.getElementById('studentMissionRepeatable').textContent,
    economy: (function () {
      var card = document.querySelector('[data-mission-id="perm_handbook_trivia"]');
      return card && card.querySelector('[data-economy]') ? card.querySelector('[data-economy]').textContent : '';
    })(),
  }));

  if (state.hasRewardMode) ok(vp.name + ' reward mode control visible');
  else bad(vp.name + ' reward mode missing');
  if (state.hasEvery) ok(vp.name + ' every completion option visible');
  else bad(vp.name + ' every completion missing');
  if (state.studentMeta.includes('every completion')) ok(vp.name + ' student every-completion copy');
  else bad(vp.name + ' student copy', state.studentMeta);
  if (state.repeatable.includes('Practice again')) ok(vp.name + ' repeatable completed copy');
  else bad(vp.name + ' practice again', state.repeatable);
  if (state.economy.includes('every completion')) ok(vp.name + ' economy preview');
  else bad(vp.name + ' economy preview', state.economy);
  if (!state.overflow) ok(vp.name + ' no horizontal overflow');
  else bad(vp.name + ' horizontal overflow');
  await page.close();
}
await browser.close();

console.log('\n#257C2 browser: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
