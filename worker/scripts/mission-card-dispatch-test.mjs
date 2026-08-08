/**
 * Mission card action dispatch + wallet display consistency (Prompt #68).
 * Usage: node worker/scripts/mission-card-dispatch-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail !== undefined ? JSON.stringify(detail) : '');
}

const missionsPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');

/* ---------- Minimal DOM stub sufficient for lantern-missions-page.js ---------- */
function makeNode(id) {
  const listeners = {};
  return {
    id: id || '',
    _listeners: listeners,
    textContent: '',
    hidden: false,
    value: '',
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    fire(type, evt) {
      (listeners[type] || []).forEach((fn) => fn(evt));
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    contains() {
      return false;
    },
  };
}

function makeGrid() {
  const appended = [];
  return {
    _appended: appended,
    _html: '',
    set innerHTML(v) {
      this._html = v;
      appended.length = 0;
    },
    get innerHTML() {
      return this._html;
    },
    appendChild(n) {
      appended.push(n);
    },
    querySelectorAll() {
      return [];
    },
  };
}

function buildSandbox() {
  const elements = {
    missionsLibraryGrid: makeGrid(),
    missionsLibraryCount: makeNode('missionsLibraryCount'),
    missionsStatusTabs: Object.assign(makeNode('missionsStatusTabs'), { querySelectorAll: () => [] }),
    missionsFiltersToggle: makeNode('missionsFiltersToggle'),
    missionsFiltersPanel: makeNode('missionsFiltersPanel'),
    missionsTypeFilter: makeNode('missionsTypeFilter'),
    missionsRewardFilter: makeNode('missionsRewardFilter'),
    missionsSortSelect: makeNode('missionsSortSelect'),
    missionsPageWalletAmt: makeNode('missionsPageWalletAmt'),
  };
  const createdNodes = [];
  const toasts = [];
  const sandbox = {
    console,
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    location: { href: '' },
    LanternCards: {
      specGameHubRailCard(o) {
        return o;
      },
      createStudentCard(spec) {
        const n = makeNode('card_' + (spec.dataAttrs && spec.dataAttrs.missionId));
        n._spec = spec;
        createdNodes.push(n);
        return n;
      },
      enhanceReportControlsIn() {},
    },
    LanternWallet: {
      _nextBalance: 214,
      fetchMyBalance() {
        return Promise.resolve({ ok: true, available: sandbox.LanternWallet._nextBalance });
      },
    },
    LanternMissionsRuntime: {
      toast(msg) {
        toasts.push(msg);
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox._elements = elements;
  sandbox._createdNodes = createdNodes;
  sandbox._toasts = toasts;
  vm.createContext(sandbox);
  vm.runInContext(missionsPageJs, sandbox);
  return sandbox;
}

function mockEvent() {
  return {
    target: { closest() { return null; } },
    preventDefault() {},
    key: '',
  };
}

/* ---------- 1. No dead cards: every card type gets a working click dispatch ---------- */
(function testDispatch() {
  const sandbox = buildSandbox();
  const calls = { hidden_nugget: 0, daily_checkin: 0, grade_reflection: 0, teacher_text: 0, teacher_media: 0 };
  const navigated = [];
  const items = [
    {
      id: 'quick_hidden_nugget',
      kind: 'quick',
      title: 'Hidden Nugget',
      status: 'available',
      onActivate() {
        calls.hidden_nugget++;
      },
    },
    {
      id: 'quick_daily_checkin',
      kind: 'quick',
      title: 'Daily Check-In',
      status: 'available',
      onActivate() {
        calls.daily_checkin++;
      },
    },
    {
      id: 'quick_grade_reflection',
      kind: 'quick',
      title: 'Grade Reflection',
      status: 'available',
      url: 'grades.html',
    },
    {
      id: 'tmission_text_1',
      kind: 'teacher',
      title: 'Teacher Text Mission',
      status: 'available',
      onActivate() {
        calls.teacher_text++;
      },
    },
    {
      id: 'tmission_media_1',
      kind: 'teacher',
      title: 'Teacher Media Mission',
      status: 'available',
      onActivate() {
        calls.teacher_media++;
      },
    },
  ];
  sandbox.LanternMissionsPage.setItems(items, false);
  if (sandbox._createdNodes.length === 5) ok('all 5 mission cards rendered');
  else bad('expected 5 rendered cards', sandbox._createdNodes.length);

  sandbox._createdNodes.forEach((node, i) => {
    const clickHandlers = node._listeners.click || [];
    const keydownHandlers = node._listeners.keydown || [];
    if (clickHandlers.length === 1 && keydownHandlers.length === 1) {
      ok('card "' + items[i].title + '" has exactly one click + keydown handler attached');
    } else {
      bad('card "' + items[i].title + '" missing click/keydown handler', {
        click: clickHandlers.length,
        keydown: keydownHandlers.length,
      });
    }
    node.fire('click', mockEvent());
  });

  if (calls.hidden_nugget === 1) ok('Hidden Nugget click resolves to its onActivate action');
  else bad('Hidden Nugget dead click', calls.hidden_nugget);

  if (calls.daily_checkin === 1) ok('Daily Check-In click resolves to its onActivate action');
  else bad('Daily Check-In dead click', calls.daily_checkin);

  if (sandbox.location.href === 'grades.html') ok('Grade Reflection click navigates to its destination (url-only card no longer dead)');
  else bad('Grade Reflection dead click', sandbox.location.href);

  if (calls.teacher_text === 1) ok('teacher text mission click resolves to its onActivate action');
  else bad('teacher text mission dead click', calls.teacher_text);

  if (calls.teacher_media === 1) ok('teacher media mission click resolves to its onActivate action');
  else bad('teacher media mission dead click', calls.teacher_media);
})();

/* ---------- 2. Errors during dispatch must be visible, not silent (§13) ---------- */
(function testErrorVisibility() {
  const sandbox = buildSandbox();
  const items = [
    {
      id: 'broken_mission',
      kind: 'teacher',
      title: 'Broken Mission',
      status: 'available',
      onActivate() {
        throw new Error('modal failed to open');
      },
    },
  ];
  sandbox.LanternMissionsPage.setItems(items, false);
  let threw = false;
  try {
    sandbox._createdNodes[0].fire('click', mockEvent());
  } catch (e) {
    threw = true;
  }
  if (!threw) ok('a throwing onActivate does not crash the click handler');
  else bad('click handler propagated an exception instead of catching it');
  if (sandbox._toasts.some((t) => /couldn.t open this mission/i.test(t))) {
    ok('visible error toast shown when a mission action throws');
  } else bad('no visible error toast on thrown mission action', sandbox._toasts);
})();

/* ---------- 3. An item with neither onActivate nor url must not fail silently ---------- */
(function testNoActionFallback() {
  const sandbox = buildSandbox();
  const items = [{ id: 'no_action', kind: 'teacher', title: 'No Action Mission', status: 'available' }];
  sandbox.LanternMissionsPage.setItems(items, false);
  sandbox._createdNodes[0].fire('click', mockEvent());
  if (sandbox._toasts.length > 0) ok('mission item with no action shows a visible message instead of doing nothing');
  else bad('mission item with no action failed completely silently');
})();

/* ---------- 4. Wallet badge tracks the authoritative wallet fixture, including after a reward ---------- */
(function testWalletConsistency() {
  const sandbox = buildSandbox();
  sandbox.LanternWallet._nextBalance = 214;
  return sandbox.LanternMissionsPage.refreshWalletDisplay()
    .then(() => {
      if (sandbox._elements.missionsPageWalletAmt.textContent === '214') {
        ok('Missions wallet badge reflects fixture authoritative balance (214)');
      } else bad('Missions wallet badge did not show 214', sandbox._elements.missionsPageWalletAmt.textContent);
      sandbox.LanternWallet._nextBalance = 217;
      return sandbox.LanternMissionsPage.refreshWalletDisplay();
    })
    .then(() => {
      if (sandbox._elements.missionsPageWalletAmt.textContent === '217') {
        ok('Missions wallet badge updates to 217 after a simulated +3 reward with no local-only value remaining');
      } else bad('Missions wallet badge did not update to 217', sandbox._elements.missionsPageWalletAmt.textContent);
    });
})().then(() => {
  /* ---------- 5. RED STOP proof: no insecure client-authoritative economy path remains for Quick Missions ---------- */
  if (!/if\s*\(\s*economyApiBase\s*\)/.test(missionsHtml)) {
    ok('missions.html: falsy empty-string economyApiBase branch removed (matches established LanternWallet fix pattern)');
  } else bad('missions.html: insecure economyApiBase truthy-check branch still present');

  if (!missionsHtml.includes('function callEconomyTransact')) {
    ok('missions.html: generic client-authoritative callEconomyTransact() removed (Quick Mission rewards can no longer self-award arbitrary deltas)');
  } else bad('missions.html: callEconomyTransact still defined');

  if (!/\+3 nuggets!\s*Daily check-in complete/i.test(missionsHtml)) {
    ok('missions.html: Daily Check-In no longer claims a Nugget credit that was not authoritatively applied');
  } else bad('missions.html: Daily Check-In still shows false reward-success messaging');

  /* ---------- 6. Every available quick-mission card built by the real page has a real action ---------- */
  const buildFnMatch = missionsHtml.match(/function buildUnifiedMissionItems\([\s\S]*?return items;\s*\}/);
  if (buildFnMatch) {
    const sandbox2 = { todayStr: () => '2026-08-08', console };
    vm.createContext(sandbox2);
    try {
      vm.runInContext(buildFnMatch[0], sandbox2);
      const items = sandbox2.buildUnifiedMissionItems(
        { daily_checkin_last: '', hidden_nugget: false, first_game: false },
        [{ id: 'm1', title: 'Teacher Mission', description: 'Do a thing', reward_amount: 5, submission_type: 'text' }],
        []
      );
      const dead = items.filter((i) => i.status === 'available' && typeof i.onActivate !== 'function' && !i.url);
      if (dead.length === 0) ok('no dead available cards: every available item has onActivate or url');
      else bad('dead available cards found', dead.map((i) => i.title));
    } catch (e) {
      bad('buildUnifiedMissionItems mock run', e.message);
    }
  } else bad('buildUnifiedMissionItems not found');

  /* ---------- 7. Ticker: community slides must attribute a name, never a bare ambiguous "N Nuggets" ---------- */
  const sandbox3 = {
    console,
    document: { getElementById: () => null },
    LANTERN_BROADCAST: {
      toBroadcastItem(raw, source) {
        if (source === 'slide') {
          return { type: raw.type, icon: '✨', title: raw.title || '', subtitle: raw.subtitle || '', avatarUrl: '', avatarEmoji: '' };
        }
        return { type: '', icon: '✨', title: '', subtitle: '', avatarUrl: '', avatarEmoji: '' };
      },
    },
  };
  sandbox3.window = sandbox3;
  sandbox3.global = sandbox3;
  vm.createContext(sandbox3);
  vm.runInContext(tickerJs, sandbox3);
  const items = sandbox3.LanternTicker.buildDisplayTickerItems(
    [],
    [{ type: 'nugget_milestone', title: '25 Nuggets', subtitle: 'Lucas' }],
    []
  );
  const text = items[0] && items[0].text ? items[0].text : '';
  if (/Lucas/.test(text) && /25 Nuggets/.test(text)) {
    ok('ticker nugget_milestone slide names the student — cannot be mistaken for the viewer\'s own wallet balance');
  } else bad('ticker nugget_milestone slide still renders an unattributed bare figure', text);

  console.log('\nMission card dispatch tests:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
});
