/**
 * Prompt #110 — global marquee/ticker speed + Admin control.
 * Usage: node worker/scripts/marquee-speed-settings-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  MARQUEE_SPEED_DEFAULT_PX_PER_SEC,
  MARQUEE_SPEED_MAX_PX_PER_SEC,
  MARQUEE_SPEED_MIN_PX_PER_SEC,
  MARQUEE_SPEED_SETTING_KEY,
  getMarqueeSpeedPxPerSecond,
  handleSettingsRoutes,
  setMarqueeSpeedPxPerSecond,
  validateMarqueeSpeedPxPerSecond,
} from '../lantern-settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let fail = 0;
let pass = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail !== undefined ? detail : '');
}

/* ---------- Mock D1 for lantern_settings ---------- */
function makeSettingsDb(initialRows) {
  const rows = { ...(initialRows || {}) };
  return {
    rows,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('SELECT value FROM lantern_settings')) {
            const key = binds[0];
            return rows[key] ? { value: rows[key].value } : null;
          }
          return null;
        },
        async run() {
          if (s.includes('INSERT INTO lantern_settings')) {
            const [key, value, updated_at, updated_by] = binds;
            rows[key] = { value, updated_at, updated_by };
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

function makeDeps(isAdmin, account) {
  return {
    jsonResponse(body, status) {
      return { status, body };
    },
    async requireAdminPilotSession() {
      if (isAdmin) return { account: account || { username: 'admin1', display_name: 'Admin One' } };
      return { response: { status: 403, body: { ok: false, error: 'forbidden' } } };
    },
    adminAuditLabel(a) {
      return (a && (a.display_name || a.username)) || 'admin';
    },
  };
}

const FAKE_URL = new URL('https://example.test/api/settings/marquee-speed');

/* ---------- 1/6. One canonical setting: default + persistence ---------- */
async function testDefaultWhenRowMissing() {
  const db = makeSettingsDb({});
  const v = await getMarqueeSpeedPxPerSecond(db);
  if (v !== MARQUEE_SPEED_DEFAULT_PX_PER_SEC) return bad('default used when row missing', v);
  ok('one canonical setting: default used when no row exists yet');
}

async function testSetThenGetPersists() {
  const db = makeSettingsDb({});
  await setMarqueeSpeedPxPerSecond(db, 45, 'admin1');
  const v = await getMarqueeSpeedPxPerSecond(db);
  if (v !== 45) return bad('persisted value read back', v);
  ok('setting persists (write then read reflects the write)');
}

async function testCorruptStoredValueFallsBackToDefault() {
  const db = makeSettingsDb({ [MARQUEE_SPEED_SETTING_KEY]: { value: 'garbage' } });
  const v = await getMarqueeSpeedPxPerSecond(db);
  if (v !== MARQUEE_SPEED_DEFAULT_PX_PER_SEC) return bad('corrupt value falls back', v);
  ok('corrupt/invalid stored value falls back to the one shared default');
}

async function testDbFailureFallsBackToOneSharedDefault() {
  const throwingDb = {
    prepare() {
      throw new Error('D1 unavailable');
    },
  };
  const v = await getMarqueeSpeedPxPerSecond(throwingDb);
  if (v !== MARQUEE_SPEED_DEFAULT_PX_PER_SEC) return bad('db failure fallback', v);
  ok('setting-load failure (DB error) uses the one shared fallback constant');
}

/* ---------- 5. Invalid speeds rejected server-side ---------- */
function testValidateRejectsInvalidValues() {
  const cases = [0, -5, NaN, Infinity, -Infinity, 'abc', '', null, undefined, {}];
  for (const c of cases) {
    const r = validateMarqueeSpeedPxPerSecond(c);
    if (r.ok) return bad('should reject: ' + JSON.stringify(c), r);
  }
  ok('invalid speeds rejected (0 / negative / NaN / strings / missing)');
}

function testValidateRejectsOutOfRangeHigh() {
  const r = validateMarqueeSpeedPxPerSecond(99999);
  if (r.ok) return bad('absurdly high speed should be rejected', r);
  ok('absurdly high speed rejected (bounded range enforced server-side)');
}

function testValidateAcceptsInRange() {
  const r = validateMarqueeSpeedPxPerSecond(60);
  if (!r.ok || r.value !== 60) return bad('in-range speed should be accepted', r);
  if (MARQUEE_SPEED_MIN_PX_PER_SEC >= MARQUEE_SPEED_MAX_PX_PER_SEC) return bad('range sanity', { MARQUEE_SPEED_MIN_PX_PER_SEC, MARQUEE_SPEED_MAX_PX_PER_SEC });
  ok('in-range speed accepted; bounded range is sane (min < max)');
}

/* ---------- 2/3/4. Admin read/write route, non-admin rejected ---------- */
async function testGetIsPublicNoAdminRequired() {
  const db = makeSettingsDb({});
  const env = { DB: db };
  const req = { method: 'GET' };
  const res = await handleSettingsRoutes(req, FAKE_URL, '/api/settings/marquee-speed', env, {}, makeDeps(false));
  if (!res.body.ok || res.body.px_per_second !== MARQUEE_SPEED_DEFAULT_PX_PER_SEC) return bad('public GET returns canonical speed', res);
  ok('GET /api/settings/marquee-speed is public and returns the canonical speed');
}

async function testPatchRejectedForNonAdmin() {
  const db = makeSettingsDb({});
  const env = { DB: db };
  const req = { method: 'PATCH', text: async () => JSON.stringify({ px_per_second: 40 }) };
  const res = await handleSettingsRoutes(req, FAKE_URL, '/api/settings/marquee-speed', env, {}, makeDeps(false));
  if (res.status !== 403) return bad('non-admin PATCH should be forbidden', res);
  const after = await getMarqueeSpeedPxPerSecond(db);
  if (after !== MARQUEE_SPEED_DEFAULT_PX_PER_SEC) return bad('non-admin PATCH must not change the setting', after);
  ok('non-admin cannot change the marquee speed (403, no mutation)');
}

async function testPatchAdminSuccessPersists() {
  const db = makeSettingsDb({});
  const env = { DB: db };
  const req = { method: 'PATCH', text: async () => JSON.stringify({ px_per_second: 40 }) };
  const res = await handleSettingsRoutes(req, FAKE_URL, '/api/settings/marquee-speed', env, {}, makeDeps(true));
  if (!res.body.ok || res.body.px_per_second !== 40) return bad('admin PATCH should succeed with 40', res);
  const after = await getMarqueeSpeedPxPerSecond(db);
  if (after !== 40) return bad('admin PATCH should persist', after);
  ok('admin can change the marquee speed and it persists for future reads');
}

async function testPatchServerRejectsOutOfRangeEvenForAdmin() {
  const db = makeSettingsDb({});
  const env = { DB: db };
  const req = { method: 'PATCH', text: async () => JSON.stringify({ px_per_second: 99999 }) };
  const res = await handleSettingsRoutes(req, FAKE_URL, '/api/settings/marquee-speed', env, {}, makeDeps(true));
  if (res.status !== 400 || res.body.ok) return bad('server should reject out-of-range even for admin', res);
  ok('server-side validation rejects out-of-range speed even from an authenticated admin');
}

/* ---------- Shared client runtime (app/js/lantern-ticker.js) ---------- */
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');

function buildTickerSandbox(fetchImpl) {
  const sandbox = {
    console,
    document: { getElementById: () => null, readyState: 'complete', addEventListener: () => {} },
    fetch: fetchImpl,
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(tickerJs, sandbox);
  return sandbox;
}

function fakeTickerTrack(copyWidthsPx) {
  const style = {};
  const copies = copyWidthsPx.map((w) => ({ scrollWidth: w }));
  return {
    style,
    querySelectorAll(sel) {
      return sel === '.lanternTickerCopy' ? copies : [];
    },
  };
}

/* ---------- 9/10/11. Same speed → different widths → different durations, constant px/sec;
   this is the exact function invoked both on first render AND on resize/content-change
   recalculation, so it proves the recalculation path, not just the math in isolation. */
function testComputeDurationSameSpeedDifferentWidths() {
  const sandbox = buildTickerSandbox(async () => {
    throw new Error('unused');
  });
  const speed = 30;
  sandbox.LanternTicker.setTickerSpeedPxPerSecond(speed);
  const narrow = fakeTickerTrack([300]);
  const wide = fakeTickerTrack([1500]);
  sandbox.LanternTicker.applyTickerDuration(narrow);
  sandbox.LanternTicker.applyTickerDuration(wide);
  const dNarrow = parseFloat(narrow.style.animationDuration);
  const dWide = parseFloat(wide.style.animationDuration);
  if (!(dWide > dNarrow)) return bad('wider content should take longer to scroll', { dNarrow, dWide });
  const pxPerSecNarrow = 300 / dNarrow;
  const pxPerSecWide = 1500 / dWide;
  if (Math.abs(pxPerSecNarrow - speed) > 0.001 || Math.abs(pxPerSecWide - speed) > 0.001) {
    return bad('computed px/sec should equal the configured canonical speed for both widths', { pxPerSecNarrow, pxPerSecWide, speed });
  }
  ok('differing content widths (viewport/content-length changes) produce differing durations but the SAME computed px/sec');
}

function testComputeDurationGuardsZeroWidthAndBadSpeed() {
  const sandbox = buildTickerSandbox(async () => {
    throw new Error('unused');
  });
  const d1 = sandbox.LanternTicker.computeTickerDurationSeconds(0, 30);
  if (!(d1 > 0) || !isFinite(d1)) return bad('zero width should not produce 0/NaN/negative duration', d1);
  const d2 = sandbox.LanternTicker.computeTickerDurationSeconds(600, 0);
  if (!(d2 > 0) || !isFinite(d2)) return bad('non-positive speed should fall back, not divide by zero', d2);
  ok('duration calculation guards zero width and non-positive speed');
}

/* ---------- 13/19. Setting-load failure uses the ONE shared fallback ---------- */
async function testFetchTickerSpeedSuccessUpdatesCanonicalSpeed() {
  const sandbox = buildTickerSandbox(async () => ({ json: async () => ({ ok: true, px_per_second: 55 }) }));
  await sandbox.LanternTicker.fetchTickerSpeed('');
  if (sandbox.LanternTicker.getTickerSpeedPxPerSecond() !== 55) {
    return bad('successful settings fetch should update the canonical speed', sandbox.LanternTicker.getTickerSpeedPxPerSecond());
  }
  ok('successful /api/settings/marquee-speed fetch updates the canonical client-side speed');
}

async function testFetchTickerSpeedFailureKeepsSharedFallback() {
  const sandbox = buildTickerSandbox(async () => {
    throw new Error('network down');
  });
  await sandbox.LanternTicker.fetchTickerSpeed('');
  const fallback = sandbox.LanternTicker.TICKER_SPEED_FALLBACK_PX_PER_SEC;
  if (sandbox.LanternTicker.getTickerSpeedPxPerSecond() !== fallback) {
    return bad('failed fetch should keep the one shared fallback', sandbox.LanternTicker.getTickerSpeedPxPerSecond());
  }
  ok('failed settings fetch (network/API failure) uses the one shared fallback constant — no per-page guessing');
}

/* ---------- 18. Reduced-motion behavior remains intact ---------- */
function testReducedMotionCssPresent() {
  const css = fs.readFileSync(path.join(root, 'app/css/lantern-ticker.css'), 'utf8');
  if (!/prefers-reduced-motion:\s*reduce/.test(css)) return bad('reduced-motion media query missing');
  if (!/\.lanternTickerTrack\s*\{[^}]*animation:\s*none\s*!important/.test(css)) {
    return bad('reduced-motion rule should hard-disable the scroll animation');
  }
  ok('prefers-reduced-motion:reduce fully disables ticker scroll animation (admin speed cannot override it)');
}

/* ---------- 7/14/17/20. Every listed surface shares ONE implementation, no page overrides ---------- */
function testAllPagesShareOneTickerImplementationNoOverrides() {
  const pages = [
    'app/explore.html',
    'app/missions.html',
    'app/games.html',
    'app/locker.html',
    'app/contribute.html',
    'app/teacher.html',
    'app/display.html',
    'app/staff.html',
    'app/admin.html',
    'app/create.html',
    'app/home.html',
    'app/feed-review.html',
    'app/my-submissions.html',
    'app/news.html',
  ];
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    if (!/css\/lantern-ticker\.css/.test(html)) return bad(rel + ' missing shared ticker CSS include');
    if (!/js\/lantern-ticker\.js/.test(html)) return bad(rel + ' missing shared ticker JS include');
    if (/animation-duration\s*:\s*\d/.test(html) || /animationDuration\s*=/.test(html)) {
      return bad(rel + ' contains a page-specific hardcoded ticker duration override');
    }
  }
  ok('Explore/Missions/Games/Locker/Contribute/Teacher/Display/Staff/Admin + converted shells include the ONE shared ticker implementation, no page-specific speed overrides');
}

function testNoHardcodedLegacyDurationRemainsInSharedFiles() {
  const js = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
  if (/TICKER_SCROLL_DURATION_S/.test(js)) return bad('legacy fixed-duration constant should be removed');
  const css = fs.readFileSync(path.join(root, 'app/css/lantern-ticker.css'), 'utf8');
  if (/animation:\s*lanternTickerScroll\s+360s/.test(css)) return bad('legacy fixed 360s CSS duration should be removed');
  ok('legacy fixed-duration (360s) implementation removed from shared ticker JS/CSS');
}

/* ---------- Admin UI wiring present ---------- */
function testAdminHasMarqueeSpeedControl() {
  const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
  if (!/id="marqueeSpeedRange"/.test(html)) return bad('admin.html missing speed range slider');
  if (!/id="marqueeSpeedNumber"/.test(html)) return bad('admin.html missing numeric speed input');
  if (!/api\/settings\/marquee-speed/.test(html)) return bad('admin.html missing settings endpoint wiring');
  if (!/PATCH/.test(html)) return bad('admin.html missing PATCH save wiring');
  if (!/id="lanternHeader"/.test(html) || !/id="lanternAppBarRoot"/.test(html)) {
    return bad('admin.html must use the canonical #lanternHeader + #lanternAppBarRoot shell');
  }
  if (!/body class="page-has-ticker"/.test(html)) return bad('admin.html missing page-has-ticker');
  const tickerIds = html.match(/id="lanternTicker"/g) || [];
  if (tickerIds.length !== 1) return bad('admin.html must have exactly one #lanternTicker (header only)', tickerIds.length);
  if (/id="marqueeSpeedPreviewWrap"/.test(html)) return bad('admin.html should not keep a second in-card ticker preview wrap');
  ok('Admin has speed control + one canonical header ticker (no duplicate preview ticker)');
}

/* ---------- Prompt #116 — canonical Explore header site-wide + Display/Behavior exceptions ---------- */
function testCanonicalHeaderShellOnNormalPages() {
  const fullPages = [
    'app/explore.html',
    'app/contribute.html',
    'app/missions.html',
    'app/games.html',
    'app/locker.html',
    'app/teacher.html',
    'app/admin.html',
    'app/staff.html',
    'app/create.html',
    'app/home.html',
    'app/feed-review.html',
    'app/my-submissions.html',
    'app/news.html',
    'app/grades.html',
    'app/thanks.html',
    'app/school-survival.html',
  ];
  for (const rel of fullPages) {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    if (!/page-has-ticker/.test(html)) return bad(rel + ' missing page-has-ticker');
    if (/page-marquee-only/.test(html)) return bad(rel + ' must not be marquee-only');
    if (!/id="lanternHeader"/.test(html)) return bad(rel + ' missing #lanternHeader');
    if (!/id="lanternTicker"/.test(html)) return bad(rel + ' missing #lanternTicker');
    if (!/id="lanternAppBarRoot"/.test(html)) return bad(rel + ' missing #lanternAppBarRoot');
    if (!/js\/lantern-nav\.js/.test(html)) return bad(rel + ' missing lantern-nav.js');
    if (!/js\/lantern-ticker\.js/.test(html)) return bad(rel + ' missing lantern-ticker.js');
    const tickers = html.match(/id="lanternTicker"/g) || [];
    if (tickers.length !== 1) return bad(rel + ' must have exactly one #lanternTicker', tickers.length);
  }
  ok('normal Lantern pages use the full canonical Explore header shell (ticker + app bar)');
}

function testDisplayMarqueeOnlyException() {
  const html = fs.readFileSync(path.join(root, 'app/display.html'), 'utf8');
  if (!/page-has-ticker/.test(html) || !/page-marquee-only/.test(html)) {
    return bad('display.html must be page-has-ticker page-marquee-only');
  }
  if (!/id="lanternTicker"/.test(html)) return bad('display.html missing canonical #lanternTicker');
  if (/id="lanternAppBarRoot"/.test(html)) return bad('display.html must omit #lanternAppBarRoot');
  if (/js\/lantern-nav\.js/.test(html)) return bad('display.html must not load lantern-nav.js');
  if (/js\/lantern-help\.js/.test(html)) return bad('display.html must not load lantern-help.js');
  if (!/js\/lantern-ticker\.js/.test(html)) return bad('display.html missing lantern-ticker.js');
  const css = fs.readFileSync(path.join(root, 'app/css/lantern-header.css'), 'utf8');
  if (!/body\.page-marquee-only #lanternHeader > #lanternAppBarRoot/.test(css)) {
    return bad('lantern-header.css missing page-marquee-only app-bar collapse rules');
  }
  if (!/--lantern-header-h-marquee:\s*48px/.test(css)) {
    return bad('lantern-header.css missing --lantern-header-h-marquee token');
  }
  const nav = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
  if (!/page-marquee-only/.test(nav)) return bad('lantern-nav.js must early-return on page-marquee-only');
  ok('Display is marquee-only (canonical ticker, no nav/search/avatar/help, no empty app-bar row)');
}

function testBehaviorHasNoLanternHeaderInRepo() {
  const appHtml = fs.readdirSync(path.join(root, 'app')).filter((f) => f.endsWith('.html'));
  const behaviorish = appHtml.filter((f) => /behavior/i.test(f));
  if (behaviorish.length) {
    return bad('unexpected Behavior HTML in Lantern app/ — Behavior must stay outside Lantern header', behaviorish.join(','));
  }
  ok('Behavior exception: no Behavior page in Lantern app/ (TMS hosts Behavior without Lantern header)');
}

function testAuthStubPagesOmitLanternHeader() {
  const stubs = [
    'app/login.html',
    'app/setup.html',
    'app/change-password.html',
    'app/device-pairing.html',
    'app/class-code.html',
    'app/auth-test.html',
    'app/index.html',
    'app/store.html',
  ];
  for (const rel of stubs) {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    if (/id="lanternHeader"/.test(html) || /id="lanternAppBarRoot"/.test(html)) {
      return bad(rel + ' should remain a header-less stub/auth/redirect surface');
    }
  }
  ok('auth/redirect stubs correctly omit the Lantern header shell');
}

/* ---------- Prompt #111 — exactly ONE marquee source (unified slides) ---------- */
function testMarqueeBuildsFromUnifiedSlidesOnly() {
  const js = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
  if (!/Prompt #111 — ONE marquee source/.test(js)) {
    return bad('lantern-ticker.js missing Prompt #111 single-source contract comment');
  }
  if (/toB\(r, 'recognition'\)/.test(js) || /toB\(n, 'news'\)/.test(js)) {
    return bad('ticker still builds items from parallel recognition/news arrays via LANTERN_BROADCAST');
  }
  if (!/function buildDisplayTickerItems\(slides\)/.test(js)) {
    return bad('buildDisplayTickerItems should take unified slides only');
  }
  if (!/Merge recognition \+ news INTO slides once/.test(js)) {
    return bad('fetchDisplayTickerState should merge recognition+news into slides once');
  }
  const sandbox = buildTickerSandbox(async () => ({ ok: true, px_per_second: 15 }));
  const slides = [
    { type: 'teacher_recognition', title: 'Ava', subtitle: 'Great work', meta: {} },
    { type: 'student_news', title: 'Band Concert', subtitle: 'News · Sam', meta: {} },
    { type: 'nugget_milestone', title: '25 Nuggets', subtitle: 'Lucas', meta: {} },
  ];
  const items = sandbox.LanternTicker.buildDisplayTickerItems(slides);
  if (items.length !== 3) return bad('slides-only builder should emit one item per hero slide', items.length);
  const blob = items.map((it) => it.text).join(' | ');
  if (!/Ava/.test(blob) || !/Band Concert/.test(blob) || !/Lucas/.test(blob)) {
    return bad('slides-only builder dropped expected content', blob);
  }
  /* Passing a second/third arg must not revive the old parallel-source path. */
  const itemsIgnoreExtra = sandbox.LanternTicker.buildDisplayTickerItems(slides, [{ character_name: 'DUP' }], [{ title: 'DUP NEWS' }]);
  if (itemsIgnoreExtra.length !== 3) {
    return bad('extra recognition/news args must not feed a second marquee source', itemsIgnoreExtra.length);
  }
  ok('marquee builds from ONE unified slides source — no parallel recognition/news item builders');
}

await testDefaultWhenRowMissing();
await testSetThenGetPersists();
await testCorruptStoredValueFallsBackToDefault();
await testDbFailureFallsBackToOneSharedDefault();
testValidateRejectsInvalidValues();
testValidateRejectsOutOfRangeHigh();
testValidateAcceptsInRange();
await testGetIsPublicNoAdminRequired();
await testPatchRejectedForNonAdmin();
await testPatchAdminSuccessPersists();
await testPatchServerRejectsOutOfRangeEvenForAdmin();
testComputeDurationSameSpeedDifferentWidths();
testComputeDurationGuardsZeroWidthAndBadSpeed();
await testFetchTickerSpeedSuccessUpdatesCanonicalSpeed();
await testFetchTickerSpeedFailureKeepsSharedFallback();
testReducedMotionCssPresent();
testAllPagesShareOneTickerImplementationNoOverrides();
testNoHardcodedLegacyDurationRemainsInSharedFiles();
testAdminHasMarqueeSpeedControl();
testMarqueeBuildsFromUnifiedSlidesOnly();
testCanonicalHeaderShellOnNormalPages();
testDisplayMarqueeOnlyException();
testBehaviorHasNoLanternHeaderInRepo();
testAuthStubPagesOmitLanternHeader();

console.log('\nmarquee-speed-settings-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
