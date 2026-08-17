/**
 * Prompt #273 — persistent Web Admin visible-watermark toggle.
 * Usage: node worker/scripts/visible-watermark-273-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  VISIBLE_WATERMARK_DEFAULT,
  VISIBLE_WATERMARK_SETTING_KEY,
  parseVisibleWatermarkEnabled,
  getVisibleWatermarkEnabled,
  setVisibleWatermarkEnabled,
  handleSettingsRoutes,
  MARQUEE_SPEED_SETTING_KEY,
  getMarqueeSpeedPxPerSecond,
} from '../lantern-settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

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
      return { status: status || 200, body };
    },
    async requireAdminPilotSession() {
      if (isAdmin) return { account: account || { username: 'admin1', role: 'admin', display_name: 'Web Admin' } };
      return { response: { status: 403, body: { ok: false, error: 'forbidden' } } };
    },
    adminAuditLabel(a) {
      return (a && (a.display_name || a.username)) || 'admin';
    },
  };
}

const WATERMARK_URL = new URL('https://example.test/api/settings/visible-watermark');
const MARQUEE_URL = new URL('https://example.test/api/settings/marquee-speed');

/* ---------- DEFAULT / ENABLED / DISABLED persistence ---------- */
async function testDefaultWhenNoSavedValue() {
  const db = makeSettingsDb({});
  const v = await getVisibleWatermarkEnabled(db);
  assert(v === true && VISIBLE_WATERMARK_DEFAULT === true, 'DEFAULT: no saved value → watermark ON');
}

async function testSavedTrueEnabled() {
  const db = makeSettingsDb({ [VISIBLE_WATERMARK_SETTING_KEY]: { value: 'true' } });
  const v = await getVisibleWatermarkEnabled(db);
  assert(v === true, 'ENABLED: saved true → watermark visible (enabled)');
}

async function testSavedFalseDisabled() {
  const db = makeSettingsDb({ [VISIBLE_WATERMARK_SETTING_KEY]: { value: 'false' } });
  const v = await getVisibleWatermarkEnabled(db);
  assert(v === false, 'DISABLED: saved false → watermark absent (disabled)');
}

async function testPersistenceRoundTrip() {
  const db = makeSettingsDb({});
  await setVisibleWatermarkEnabled(db, false, 'admin1');
  const off = await getVisibleWatermarkEnabled(db);
  await setVisibleWatermarkEnabled(db, true, 'admin1');
  const on = await getVisibleWatermarkEnabled(db);
  assert(off === false && on === true, 'PERSISTENCE: admin save OFF then ON is authoritative on later reads');
}

async function testMalformedAndReadFailureStayOn() {
  const malformed = await getVisibleWatermarkEnabled(
    makeSettingsDb({ [VISIBLE_WATERMARK_SETTING_KEY]: { value: 'garbage' } })
  );
  const throwingDb = {
    prepare() {
      throw new Error('D1 unavailable');
    },
  };
  const failed = await getVisibleWatermarkEnabled(throwingDb);
  assert(malformed === true && failed === true, 'FAILURE: malformed setting or read failure → ON');
}

function testParser() {
  assert(parseVisibleWatermarkEnabled(true).value === true, 'parser accepts boolean true');
  assert(parseVisibleWatermarkEnabled(false).value === false, 'parser accepts boolean false');
  assert(parseVisibleWatermarkEnabled('OFF').value === false, 'parser accepts OFF');
  assert(parseVisibleWatermarkEnabled('on').value === true, 'parser accepts on');
  assert(parseVisibleWatermarkEnabled('nope').ok === false, 'parser rejects malformed');
  assert(parseVisibleWatermarkEnabled(null).ok === false, 'parser rejects missing');
}

/* ---------- SECURITY ---------- */
async function testGetIsPublic() {
  const env = { DB: makeSettingsDb({}) };
  const res = await handleSettingsRoutes(
    { method: 'GET' },
    WATERMARK_URL,
    '/api/settings/visible-watermark',
    env,
    {},
    makeDeps(false)
  );
  assert(res.body.ok === true && res.body.enabled === true, 'GET /api/settings/visible-watermark is public and defaults ON');
}

async function testPatchRejected(label, isAdmin, account) {
  const db = makeSettingsDb({});
  const env = { DB: db };
  const res = await handleSettingsRoutes(
    { method: 'PATCH', text: async () => JSON.stringify({ enabled: false }) },
    WATERMARK_URL,
    '/api/settings/visible-watermark',
    env,
    {},
    makeDeps(isAdmin, account)
  );
  const after = await getVisibleWatermarkEnabled(db);
  assert(res.status === 403 && after === true, label);
}

async function testPatchAdminAllowed() {
  const db = makeSettingsDb({});
  const env = { DB: db };
  const off = await handleSettingsRoutes(
    { method: 'PATCH', text: async () => JSON.stringify({ enabled: false }) },
    WATERMARK_URL,
    '/api/settings/visible-watermark',
    env,
    {},
    makeDeps(true, { username: 'admin1', role: 'admin', display_name: 'Web Admin' })
  );
  const afterOff = await getVisibleWatermarkEnabled(db);
  const on = await handleSettingsRoutes(
    { method: 'PATCH', text: async () => JSON.stringify({ enabled: true }) },
    WATERMARK_URL,
    '/api/settings/visible-watermark',
    env,
    {},
    makeDeps(true, { username: 'admin1', role: 'admin' })
  );
  const afterOn = await getVisibleWatermarkEnabled(db);
  assert(
    off.body.ok === true &&
      off.body.enabled === false &&
      afterOff === false &&
      on.body.ok === true &&
      on.body.enabled === true &&
      afterOn === true,
    'SECURITY: Web Admin/System Admin can change setting ON and OFF'
  );
}

async function testUnrelatedMarqueeUnchanged() {
  const db = makeSettingsDb({
    [MARQUEE_SPEED_SETTING_KEY]: { value: '45' },
  });
  const env = { DB: db };
  await handleSettingsRoutes(
    { method: 'PATCH', text: async () => JSON.stringify({ enabled: false }) },
    WATERMARK_URL,
    '/api/settings/visible-watermark',
    env,
    {},
    makeDeps(true)
  );
  const speed = await getMarqueeSpeedPxPerSecond(db);
  const marqueeGet = await handleSettingsRoutes(
    { method: 'GET' },
    MARQUEE_URL,
    '/api/settings/marquee-speed',
    env,
    {},
    makeDeps(false)
  );
  assert(speed === 45 && marqueeGet.body.px_per_second === 45, 'REGRESSION: unrelated marquee setting remains unchanged');
}

/* ---------- Client helper ON/OFF ---------- */
function buildProtectedSandbox() {
  const marks = [];
  const kids = [];
  const viewport = {
    classList: { contains() { return true; }, add() {} },
    children: kids,
    querySelector() { return null; },
    appendChild(el) {
      kids.push(el);
      marks.push(el);
    },
  };
  const media = {
    nodeType: 1,
    classList: { add() {} },
    setAttribute() {},
    closest() { return viewport; },
    parentNode: { classList: { contains() { return true; } } },
    currentSrc: '/api/news/image?key=news/student-photo.png',
    src: '/api/news/image?key=news/student-photo.png',
    getAttribute(name) { return name === 'src' ? this.src : ''; },
  };
  const removed = [];
  const markNodes = [];
  function removeChild(child) {
    removed.push(child);
    const idx = markNodes.indexOf(child);
    if (idx !== -1) markNodes.splice(idx, 1);
    return child;
  }
  const sandbox = {
    console,
    document: {
      readyState: 'complete',
      addEventListener() {},
      querySelector() { return { rel: 'stylesheet' }; },
      querySelectorAll(sel) {
        if (String(sel).indexOf('lanternProtectedMediaMark') !== -1 || String(sel).indexOf('data-lantern-media-mark') !== -1) {
          return markNodes.slice();
        }
        if (String(sel).indexOf('img') !== -1 || String(sel).indexOf('video') !== -1) return [media];
        return [];
      },
      getElementById() { return null; },
      createElement(tag) {
        const el = {
          tagName: String(tag).toUpperCase(),
          className: '',
          classList: { add() {}, contains() { return false; } },
          children: [],
          style: {},
          innerHTML: '',
          firstChild: null,
          parentNode: {
            removeChild(child) { removed.push(child); },
          },
          setAttribute() {},
          getAttribute() { return ''; },
          appendChild(child) { this.children.push(child); this.firstChild = this.firstChild || child; },
        };
        Object.defineProperty(el, 'innerHTML', {
          get() { return this._html || ''; },
          set(v) {
            this._html = String(v);
            this.firstChild = {
              className: 'lanternProtectedMediaMark lanternProtectedMediaMark--media',
              classList: { contains(c) { return String(this.className).indexOf(c) !== -1; } },
              setAttribute(name, val) { this[name] = val; },
              getAttribute(name) { return this[name] || ''; },
              parentNode: { removeChild: removeChild },
            };
          },
        });
        return el;
      },
      documentElement: {
        classList: { add() {} },
        dataset: {},
        setAttribute() {},
        getAttribute() { return ''; },
      },
      body: {},
      head: { appendChild() {} },
    },
    fetch() {
      return Promise.resolve({ json: async () => ({ ok: true, enabled: true }) });
    },
    location: { pathname: '/explore.html' },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('app/js/lantern-protected-content.js'), sandbox);
  sandbox.__media = media;
  sandbox.__viewport = viewport;
  sandbox.__marks = marks;
  sandbox.__removed = removed;
  sandbox.__markNodes = markNodes;
  return sandbox;
}

function testClientDefaultOn() {
  const s = buildProtectedSandbox();
  const api = s.LanternProtectedContent;
  assert(api.isVisibleWatermarkEnabled() === true, 'client default/fallback is watermark ON');
}

function testClientEnabledRendersMark() {
  const s = buildProtectedSandbox();
  const api = s.LanternProtectedContent;
  const mark = api.decorateMedia(s.__media, { label: 'TMS • X7K4P2', force: true });
  assert(!!mark && s.__marks.length === 1, 'ENABLED: saved/default true → watermark visible on media');
}

function testClientDisabledRemovesMark() {
  const s = buildProtectedSandbox();
  const api = s.LanternProtectedContent;
  const mark = api.decorateMedia(s.__media, { label: 'TMS • X7K4P2', force: true });
  s.__markNodes.push(mark);
  api.setVisibleWatermarkEnabled(false);
  const again = api.decorateMedia(s.__media, { label: 'TMS • X7K4P2', force: true });
  const fs = api.decorateFullscreen({ querySelector() { return s.__viewport; } }, { label: 'TMS • X7K4P2', force: true });
  assert(
    api.isVisibleWatermarkEnabled() === false &&
      again === null &&
      fs === null &&
      s.__removed.length >= 1,
    'DISABLED: saved false → watermark absent, no leftover overlay'
  );
}

function testOffLeavesNoBlockingOverlay() {
  const css = read('app/css/lantern-protected-content.css');
  const js = read('app/js/lantern-protected-content.js');
  assert(
    /pointer-events:\s*none/.test(css) &&
      js.includes('removeVisibleMediaMarks') &&
      js.includes("parentNode.removeChild") &&
      js.includes('isVisibleWatermarkEnabled()') &&
      !/opacity:\s*0/.test(js),
    'REGRESSION: OFF removes marks instead of leaving a transparent blocking overlay'
  );
}

function testOnAppearanceUnchanged() {
  const css = read('app/css/lantern-protected-content.css');
  const js = read('app/js/lantern-protected-content.js');
  assert(
    js.includes("return 'TMS • ' + c") &&
      /opacity:\s*0\.16/.test(css) &&
      /transform:\s*rotate\(-28deg\)/.test(css) &&
      /left:\s*8px/.test(css) &&
      /bottom:\s*8px/.test(css),
    'REGRESSION: watermark appearance is unchanged while ON'
  );
}

/* ---------- COVERAGE: one helper, all current surfaces ---------- */
function testCoverageSameSetting() {
  const nav = read('app/js/lantern-nav.js');
  const js = read('app/js/lantern-protected-content.js');
  const pages = [
    'app/explore.html',
    'app/locker.html',
    'app/contribute.html',
    'app/missions.html',
    'app/create.html',
    'app/news.html',
    'app/teacher.html',
    'app/admin.html',
    'app/staff.html',
    'app/feed-review.html',
    'app/games.html',
    'app/home.html',
    'app/my-submissions.html',
  ];
  const missing = pages.filter((rel) => !/js\/lantern-nav\.js/.test(read(rel)));
  assert(
    /lantern-protected-content\.js\?v=273/.test(nav) &&
      js.includes('/api/settings/visible-watermark') &&
      js.includes('applyVisibleWatermarkEnabled') &&
      missing.length === 0,
    'COVERAGE: every current watermark surface loads the one helper that obeys the same setting',
    missing
  );
}

function testAdminUi() {
  const html = read('app/admin.html');
  assert(
    /id="visibleWatermarkCard"/.test(html) &&
      /Visible Watermark/.test(html) &&
      /Show the Lantern visible watermark across supported pages/.test(html) &&
      /id="visibleWatermarkEnabled"/.test(html) &&
      /id="visibleWatermarkStateLabel"/.test(html) &&
      /api\/settings\/visible-watermark/.test(html) &&
      html.includes("role !== 'admin'") &&
      !/teacher\.html/.test(html.match(/id="visibleWatermarkCard"[\s\S]{0,400}/)[0] || ''),
    'Web Admin UI exposes Visible Watermark ON/OFF on admin.html only'
  );
}

function testNoSchemaOrAuthRedesign() {
  const settings = read('worker/lantern-settings.js');
  const js = read('app/js/lantern-protected-content.js');
  assert(
    settings.includes("VISIBLE_WATERMARK_SETTING_KEY = 'visible_watermark_enabled'") &&
      settings.includes('requireAdminPilotSession') &&
      !fs.existsSync(path.join(root, 'worker/migrations/074_visible_watermark.sql')) &&
      !/CREATE TABLE/.test(settings) &&
      js.includes('trace_code') &&
      js.includes('fetchViewSession'),
    'no new D1 table; receipts/trace path remains; admin write still requireAdminPilotSession'
  );
}

await testDefaultWhenNoSavedValue();
await testSavedTrueEnabled();
await testSavedFalseDisabled();
await testPersistenceRoundTrip();
await testMalformedAndReadFailureStayOn();
testParser();
await testGetIsPublic();
await testPatchRejected('SECURITY: unauthorized/non-admin request cannot change setting', false);
await testPatchRejected('SECURITY: teacher cannot change setting', false, { username: 'teacher1', role: 'teacher' });
await testPatchRejected('SECURITY: student cannot change setting', false, { username: 'student1', role: 'student' });
await testPatchAdminAllowed();
await testUnrelatedMarqueeUnchanged();
testClientDefaultOn();
testClientEnabledRendersMark();
testClientDisabledRemovesMark();
testOffLeavesNoBlockingOverlay();
testOnAppearanceUnchanged();
testCoverageSameSetting();
testAdminUi();
testNoSchemaOrAuthRedesign();

console.log('\nvisible-watermark-273-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
