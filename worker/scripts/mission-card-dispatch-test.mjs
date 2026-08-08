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
  let builtItems = null;
  let sandbox2 = null;
  if (buildFnMatch) {
    sandbox2 = { todayStr: () => '2026-08-08', console };
    sandbox2.window = sandbox2;
    vm.createContext(sandbox2);
    try {
      vm.runInContext(buildFnMatch[0], sandbox2);
      const items = sandbox2.buildUnifiedMissionItems(
        { daily_checkin_last: '', hidden_nugget: false, first_game: false },
        [{ id: 'm1', title: 'Teacher Mission', description: 'Do a thing', reward_amount: 5, submission_type: 'text' }],
        []
      );
      builtItems = items;
      const dead = items.filter((i) => i.status === 'available' && typeof i.onActivate !== 'function' && !i.url);
      if (dead.length === 0) ok('no dead available cards: every available item has onActivate or url');
      else bad('dead available cards found', dead.map((i) => i.title));
    } catch (e) {
      bad('buildUnifiedMissionItems mock run', e.message);
    }
  } else bad('buildUnifiedMissionItems not found');

  /* ---------- 6b. Prompt #69 RED STOP proof: Thank-You/Grade Reflection no longer route into the
     legacy localStorage-only thanks.html/grades.html destinations (no cross-device teacher visibility,
     no real reward path, and — until fixed — an auth-bootstrap redirect to /login). They must instead
     resolve to a truthful in-place onActivate action, never a url navigation. ---------- */
  if (builtItems) {
    const thankYou = builtItems.find((i) => i.id === 'quick_thank_you');
    const gradeRefl = builtItems.find((i) => i.id === 'quick_grade_reflection');
    if (thankYou && typeof thankYou.onActivate === 'function' && !thankYou.url) {
      ok('Thank-You Letter no longer navigates to the legacy thanks.html destination');
    } else bad('Thank-You Letter still has a url (would hit the legacy/broken destination)', thankYou);
    if (gradeRefl && typeof gradeRefl.onActivate === 'function' && !gradeRefl.url) {
      ok('Grade Reflection no longer navigates to the legacy grades.html destination');
    } else bad('Grade Reflection still has a url (would hit the legacy/broken destination)', gradeRefl);
  }

  /* ---------- 6c. Hidden Nugget keeps working (control case) after all other fixes ---------- */
  if (builtItems && sandbox2) {
    const hidden = builtItems.find((i) => i.id === 'quick_hidden_nugget');
    const cardUiCalls = [];
    sandbox2.window.LanternCardUI = { openTextDetail: (...args) => cardUiCalls.push(args) };
    let threw = null;
    if (hidden && typeof hidden.onActivate === 'function') {
      try {
        hidden.onActivate();
      } catch (e) {
        threw = e;
      }
    }
    if (!threw && cardUiCalls.length === 1) ok('Hidden Nugget onActivate still opens its detail surface (control case unaffected)');
    else bad('Hidden Nugget onActivate regressed', threw ? String(threw) : hidden);
  }

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

  /* ---------- 8. Static guard: missions.html's main inline <script> is a plain (function(){})()
     IIFE with no `global` parameter (unlike lantern-missions-page.js's (function(global){})(window)
     module pattern). Any bare `global.` reference inside it is guaranteed to throw
     "ReferenceError: global is not defined" in a real browser — this is the exact Prompt #69
     production bug (openMissionDetailModal's global.scrollY / closeMissionDetailModal's
     global.scrollTo silently broke every teacher-mission modal open). ---------- */
  const scriptBlocks = missionsHtml
    .split(/<script(?:\s[^>]*)?>/)
    .slice(1)
    .map((s) => s.split('</script>')[0]);
  const mainScript = scriptBlocks.find((s) => s.includes('function openMissionSubmitModal'));
  if (mainScript) {
    const bareGlobalRefs = mainScript.match(/\bglobal\.\w+/g) || [];
    if (bareGlobalRefs.length === 0) {
      ok('missions.html main script: no bare global.* references (only window/document are real browser globals here)');
    } else {
      bad('missions.html main script still contains bare global.* references that will throw in a browser', bareGlobalRefs);
    }
  } else {
    bad('could not locate missions.html main inline script containing openMissionSubmitModal');
  }

  /* ---------- 9. Dynamic proof: actually execute the real openMissionSubmitModal /
     openMissionDetailModal extracted from missions.html against a DOM stub, for one mission of
     each currently supported submission_type. This is what actually caught the Prompt #69 bug —
     the vm.createContext sandbox below deliberately does NOT define a bare `global` identifier,
     so any regression of that exact class fails loudly here instead of only in production. ---------- */
  if (mainScript) {
    function makeStubEl(id) {
      const listeners = {};
      const stub = {
        id: id || '',
        _listeners: listeners,
        value: '',
        textContent: '',
        hidden: false,
        disabled: false,
        src: '',
        href: '',
        style: {},
        dataset: {},
        classList: {
          _set: new Set(),
          add(c) { this._set.add(c); },
          remove(c) { this._set.delete(c); },
          toggle(c, v) { if (v === false) this._set.delete(c); else this._set.add(c); },
          contains(c) { return this._set.has(c); },
        },
        addEventListener(type, fn) {
          listeners[type] = listeners[type] || [];
          listeners[type].push(fn);
        },
        removeEventListener() {},
        setAttribute() {},
        getAttribute() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        appendChild() {},
        closest() { return null; },
        contains() { return false; },
        focus() {},
        scrollIntoView() {},
      };
      return stub;
    }
    function buildModalSandbox() {
      const elements = {};
      const getEl = (id) => {
        if (!elements[id]) elements[id] = makeStubEl(id);
        return elements[id];
      };
      const toasts = [];
      const sandbox = {
        console,
        fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
        document: {
          activeElement: makeStubEl('activeElement'),
          body: makeStubEl('body'),
          documentElement: Object.assign(makeStubEl('documentElement'), { scrollTop: 0 }),
          getElementById: getEl,
          createElement: () => makeStubEl('created'),
          addEventListener() {},
        },
        location: { href: '', pathname: '/missions.html', search: '', hash: '' },
        getComputedStyle: () => ({ visibility: 'hidden' }),
        Promise,
        JSON,
        setTimeout,
        clearTimeout,
      };
      sandbox.window = sandbox;
      sandbox.window.scrollY = 0;
      sandbox.window.scrollTo = () => {};
      sandbox.window.LanternCards = {
        specOpenedMissionDraft: () => ({}),
        createStudentCard: () => makeStubEl('preview'),
        enhanceReportControlsIn: () => {},
      };
      sandbox.window.LanternMissionsPage = null;
      sandbox._elements = elements;
      sandbox._toasts = toasts;
      return sandbox;
    }

    const submissionTypeFixtures = [
      { id: 'tm-text', submission_type: 'text', title: 'Read a book', allows_text: true },
      { id: 'tm-image', submission_type: 'image_url', title: 'Photo mission', allows_image: true },
      { id: 'tm-poll', submission_type: 'poll', title: 'Create a poll' },
      { id: 'tm-bug', submission_type: 'bug_report', title: 'Report a bug' },
    ];
    submissionTypeFixtures.forEach((fixture) => {
      const sandbox = buildModalSandbox();
      vm.createContext(sandbox);
      try {
        vm.runInContext(mainScript, sandbox);
      } catch (e) {
        bad('missions.html main script failed to load in DOM-stub sandbox for ' + fixture.submission_type, String(e));
        return;
      }
      let threw = null;
      try {
        sandbox.openMissionSubmitModal(fixture, null, '');
      } catch (e) {
        threw = e;
      }
      const overlay = sandbox._elements['missionDetailOverlay'];
      const isOpen = overlay && overlay.classList.contains('is-open') && overlay.hidden === false;
      if (!threw && isOpen) {
        ok('openMissionSubmitModal(' + fixture.submission_type + ') opens the real mission detail modal with no exception');
      } else {
        bad('openMissionSubmitModal(' + fixture.submission_type + ') did not open the modal', threw ? String(threw) : 'overlay not open');
      }
    });
  }

  console.log('\nMission card dispatch tests:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
});
