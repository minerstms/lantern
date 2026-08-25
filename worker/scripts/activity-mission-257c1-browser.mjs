/**
 * Prompt #257C1 browser QA — admin + student mission copy at required viewports.
 * Usage:
 *   npx serve app -l 8765
 *   node worker/scripts/activity-mission-257c1-browser.mjs http://127.0.0.1:8765
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
  await page.goto(base + '/dev/activity-mission-257c1-harness.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true, { timeout: 10000 });

  const state = await page.evaluate(() => {
    var m200 = window.__HARNESS_MISSIONS__.find(function (m) {
      return m.min_characters === 200;
    });
    if (m200) {
      window.__HARNESS_ACTIVE__ = m200;
      document.getElementById('studentMissionTitle').textContent = m200.title;
      document.getElementById('studentMissionMeta').textContent = window.LanternMissionCopy.formatMissionStudentCopy(m200);
    }
    window.LanternCharacterExample.openExample(100);
    var modalVisible = !document.getElementById('lanternCharacterExampleModal').hidden;
    document.getElementById('lanternCharacterExampleModal').hidden = true;
    document.getElementById('studentText').value = 'x'.repeat(200);
    document.getElementById('studentText').dispatchEvent(new Event('input'));
    var counter = document.getElementById('studentCounter').textContent;
    var thank = window.__HARNESS_MISSIONS__.find(function (m) {
      return m.id === 'perm_thank_you';
    });
    var thankCopy = thank ? window.LanternMissionCopy.formatMissionStudentCopy(thank) : '';
    return {
      hasStem: window.__HARNESS_HAS_STEM__,
      overflow: window.__HARNESS_OVERFLOW__,
      adminCards: document.querySelectorAll('#adminList .card').length,
      thankCopy: thankCopy,
      modalVisible: modalVisible,
      counterMet: /Minimum reached/.test(counter),
      stemInAdmin: !!Array.from(document.querySelectorAll('#adminList strong')).find(function (el) {
        return el.textContent === 'STEM Today';
      }),
    };
  });

  if (
    state.hasStem &&
    state.adminCards >= 4 &&
    state.stemInAdmin &&
    !state.overflow &&
    /100\+ characters/.test(state.thankCopy) &&
    /\+3 Nuggets/.test(state.thankCopy) &&
    state.modalVisible &&
    state.counterMet
  ) {
    ok(vp.name + ' harness admin + student copy');
  } else {
    bad(vp.name + ' harness', state);
  }

  const stemCopy = await page.evaluate(() => {
    var stem = window.__HARNESS_MISSIONS__.find(function (m) {
      return m.title === 'STEM Today';
    });
    return stem ? window.LanternMissionCopy.formatMissionStudentCopy(stem) : '';
  });
  if (/500\+ characters/.test(stemCopy) && /\+5 Nuggets/.test(stemCopy) && /Image required/.test(stemCopy)) {
    ok(vp.name + ' STEM Today copy');
  } else bad(vp.name + ' STEM copy', stemCopy);

  await page.close();
}
await browser.close();

console.log('\n#257C1 browser:', pass, 'pass,', fail, 'fail');
process.exit(fail ? 1 : 0);
