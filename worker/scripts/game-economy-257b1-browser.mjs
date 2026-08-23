/**
 * Prompt #257B1 browser QA — admin + game copy at staff/mobile viewports.
 *
 * Usage:
 *   npx serve app -l 8765
 *   node worker/scripts/game-economy-257b1-browser.mjs http://127.0.0.1:8765
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
  await page.goto(base + '/dev/game-economy-257b1-harness.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__HARNESS_READY__ === true, { timeout: 10000 });
  const state = await page.evaluate(() => ({
    hasGlobal: window.__HARNESS_HAS_GLOBAL_DEFAULT__,
    legacyHidden: !window.__HARNESS_HAS_LEGACY_GAME_PLAY_ROW__,
    gameRows: window.__HARNESS_GAME_ROW_COUNT__,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    globalLabel: document.getElementById('gameEconomyDefault')?.selectedOptions?.[0]?.textContent || '',
    stackCopy: document.querySelector('[data-game-id="tower"] .card-meta')?.textContent || '',
    freeCopy: document.querySelector('[data-game-id="reaction"] .card-meta')?.textContent || '',
    threeCopy: document.querySelector('[data-game-id="memory"] .play-action')?.textContent || '',
    staleOnePlay: document.querySelector('[data-game-id="reaction"]')?.textContent?.includes('1 Nugget = 1 Play'),
  }));
  if (
    state.hasGlobal &&
    state.legacyHidden &&
    state.gameRows >= 5 &&
    !state.overflow &&
    /2 Plays/.test(state.globalLabel) &&
    /2 Plays/.test(state.stackCopy) &&
    state.freeCopy === 'Free Play' &&
    /3 Plays/.test(state.threeCopy) &&
    !state.staleOnePlay
  ) {
    ok(vp.name + ' admin + game copy layout');
  } else {
    bad(vp.name + ' harness checks', state);
  }
  await page.close();
}
await browser.close();

console.log('\n#257B1 browser:', pass, 'pass,', fail, 'fail');
process.exit(fail ? 1 : 0);
