/**
 * Prompt #160 — counterfeit-card diagnostics + optional meta contract.
 * Usage: node worker/scripts/card-counterfeit-contract-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail || '');
}

const enforceSrc = fs.readFileSync(path.join(root, 'app/js/lantern-canonical-enforce.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const bootSrc = fs.readFileSync(path.join(root, 'app/js/lantern-canonical-route-boot.js'), 'utf8');
const missionsPage = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');

const retiredMetaphor = 'can' + 'cer';
const retiredClass = 'lanternCardC' + 'ancer';
const retiredReport = '__lanternC' + 'ancerReport';
const retiredBanner = 'CARD C' + 'ANCER';

if (!new RegExp(retiredMetaphor, 'i').test(enforceSrc) && !new RegExp(retiredMetaphor, 'i').test(cardsCss) && !new RegExp(retiredMetaphor, 'i').test(bootSrc)) {
  ok('enforce/CSS/boot have zero retired diagnostic metaphor terminology');
} else bad('retired diagnostic metaphor remains in enforce/CSS/boot');

if (!new RegExp(retiredMetaphor, 'i').test(cardsJs)) ok('lantern-cards.js has zero retired diagnostic metaphor terminology');
else bad('lantern-cards.js still mentions retired diagnostic metaphor');

if (/MISSING_META_ROW/.test(enforceSrc)) bad('MISSING_META_ROW still treated as failure');
else ok('missing meta row is not a counterfeit reason');

if (/allowVisualCounterfeitMark/.test(enforceSrc) && /lanternDebugCards=1/.test(enforceSrc)) {
  ok('visual counterfeit mark gated to developer contexts');
} else bad('visual mark gate missing');

if (/lanternCardCounterfeit/.test(cardsCss) && /lanternCardCounterfeitBanner/.test(cardsCss)) {
  ok('CSS uses counterfeit class names');
} else bad('CSS counterfeit classes');

if (cardsCss.includes(retiredClass) || enforceSrc.includes(retiredBanner)) {
  bad('legacy retired diagnostic class/string still present');
} else ok('legacy retired diagnostic class/strings removed');

if (/__lanternCounterfeitReport/.test(enforceSrc) && /__lanternCounterfeitReport/.test(bootSrc)) {
  ok('report global renamed to __lanternCounterfeitReport');
} else bad('counterfeit report global');

if (enforceSrc.includes(retiredReport) || bootSrc.includes(retiredReport)) {
  bad('legacy retired diagnostic report global still authored');
} else ok('legacy retired diagnostic report global removed from authors');

/* Load compositor + enforce in a stub DOM */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '',
    id: '',
    children: [],
    attributes: {},
    style: {},
    parentNode: null,
    ownerDocument: null,
    classList: {
      _s: new Set(),
      contains(c) {
        return this._s.has(c);
      },
      add(c) {
        this._s.add(c);
        el.className = Array.from(this._s).join(' ');
      },
      remove(c) {
        this._s.delete(c);
        el.className = Array.from(this._s).join(' ');
      },
    },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
    },
    removeAttribute(k) {
      delete this.attributes[k];
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(sel) {
      return queryAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(this, sel);
    },
    getBoundingClientRect() {
      return { width: 280, height: 158, top: 0, left: 0, right: 280, bottom: 158 };
    },
    offsetWidth: 280,
    offsetHeight: 158,
    scrollHeight: 20,
    clientHeight: 20,
    closest() {
      return null;
    },
  };
  el.classList._s = new Set();
  return el;
}

function parseClassList(node) {
  return String(node.className || '')
    .split(/\s+/)
    .filter(Boolean);
}

function matchesSimple(node, sel) {
  if (!node || !node.tagName) return false;
  if (sel === ':scope') return true;
  if (sel.startsWith('.')) {
    return parseClassList(node).includes(sel.slice(1));
  }
  return false;
}

function queryAll(root, sel) {
  const out = [];
  const parts = String(sel || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  function walk(n) {
    if (!n) return;
    parts.forEach((p) => {
      if (p.includes(' ')) return;
      let s = p;
      if (s.startsWith(':scope > ')) s = s.slice(':scope > '.length);
      if (s.startsWith('.')) {
        if (parseClassList(n).includes(s.slice(1))) out.push(n);
      }
    });
    (n.children || []).forEach(walk);
  }
  /* Prefer class-token match across subtree */
  const want = [];
  parts.forEach((p) => {
    const m = p.match(/\.([A-Za-z0-9_-]+)/g);
    if (m) want.push(...m.map((x) => x.slice(1)));
  });
  function deep(n) {
    if (!n) return;
    const cls = parseClassList(n);
    if (want.length && want.every((w) => cls.includes(w) || parts.some((p) => p.includes('.' + w) && cls.includes(w)))) {
      /* push if any class from selector matches for single-class selectors */
    }
    for (let i = 0; i < want.length; i++) {
      if (cls.includes(want[i]) && parts.some((p) => p === '.' + want[i] || p.endsWith('.' + want[i]))) {
        out.push(n);
        break;
      }
    }
    (n.children || []).forEach(deep);
  }
  if (want.length) deep(root);
  else walk(root);
  return out;
}

const doc = {
  body: makeEl('body'),
  documentElement: makeEl('html'),
  readyState: 'complete',
  createElement: makeEl,
  getElementById() {
    return null;
  },
  querySelectorAll(sel) {
    return queryAll(doc.body, sel);
  },
  querySelector(sel) {
    return queryAll(doc.body, sel)[0] || null;
  },
  addEventListener() {},
};
doc.body.ownerDocument = doc;

const sandbox = {
  console,
  document: doc,
  window: undefined,
  location: { hostname: 'lantern-42i.pages.dev', pathname: '/missions', search: '', hash: '' },
  getComputedStyle(el) {
    return {
      display: 'block',
      visibility: 'visible',
      objectFit: 'cover',
      webkitLineClamp: '1',
      lineHeight: '18.7px',
      fontSize: '17px',
      getPropertyValue(name) {
        if (name === '-webkit-line-clamp') return '1';
        if (name === '--lantern-card-width') return '280px';
        return '';
      },
    };
  },
  MutationObserver: function () {
    this.observe = function () {};
    this.disconnect = function () {};
  },
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  requestAnimationFrame: (fn) => fn(),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* Minimal cards stub not needed — load enforce only for inspect API */
vm.runInContext(enforceSrc, sandbox);
const Enf = sandbox.LanternCanonicalEnforce;

function buildCanonicalFace(opts) {
  opts = opts || {};
  const card = makeEl('div');
  card.classList.add('exploreCard');
  card.classList.add('lanternCanonicalCard');
  card.classList.add('gamesHubPlayCard');
  card.setAttribute('data-lantern-card', 'true');
  card.setAttribute('data-lantern-brand', 'lantern');
  card.setAttribute('data-lantern-card-factory', 'LanternCards');
  card.setAttribute('data-lantern-card-type', 'game_hub');
  card.setAttribute('data-lantern-card-surface', 'face');
  card.setAttribute('data-lantern-card-contract-version', '2');
  const frame = makeEl('div');
  frame.classList.add('lanternCanonicalCardFrame');
  const img = makeEl('img');
  img.classList.add('lanternCanonicalCardImage');
  frame.appendChild(img);
  const overlay = makeEl('div');
  overlay.classList.add('lanternCanonicalCardOverlay');
  const grad = makeEl('div');
  grad.classList.add('lanternCanonicalCardGradient');
  overlay.appendChild(grad);
  const caption = makeEl('div');
  caption.classList.add('lanternCanonicalCardCaption');
  const title = makeEl('h3');
  title.classList.add('lanternCanonicalCardTitle');
  title.textContent = opts.title || 'Untitled';
  caption.appendChild(title);
  if (opts.withMeta) {
    const meta = makeEl('div');
    meta.classList.add('lanternCanonicalCardMeta');
    meta.scrollHeight = 14;
    meta.clientHeight = 14;
    caption.appendChild(meta);
  }
  overlay.appendChild(caption);
  frame.appendChild(overlay);
  card.appendChild(frame);
  return card;
}

const titleOnly = buildCanonicalFace({ title: 'Thank-You Letter', withMeta: false });
const r1 = Enf.inspectExploreCard(titleOnly);
if (r1.ok) ok('title-only Thank-You Letter is NOT counterfeit');
else bad('title-only classified counterfeit', r1.reasons);

const withMeta = buildCanonicalFace({ title: 'First Game Played', withMeta: true });
const r2 = Enf.inspectExploreCard(withMeta);
if (r2.ok) ok('First Game Played with meta remains healthy');
else bad('First Game Played failed', r2.reasons);

['Grade Reflection', 'Hidden Nugget'].forEach((t) => {
  const c = buildCanonicalFace({ title: t, withMeta: false });
  const r = Enf.inspectExploreCard(c);
  if (r.ok) ok(t + ' title-only is NOT counterfeit');
  else bad(t + ' false counterfeit', r.reasons);
});

const fake = makeEl('div');
fake.classList.add('exploreCard');
fake.classList.add('lanternCanonicalCard');
fake.setAttribute('data-lantern-card-surface', 'face');
/* missing factory/brand/frame → genuine counterfeit */
const rFake = Enf.inspectExploreCard(fake);
if (!rFake.ok && rFake.reasons.includes('MISSING_OR_BAD_FACTORY_STAMP')) {
  ok('hand-built card without factory stamp is detected as counterfeit');
} else bad('genuine counterfeit not detected', rFake);

if (!Enf.allowVisualCounterfeitMark()) {
  ok('production hostname does not allow visual counterfeit overlays');
} else bad('visual mark wrongly allowed on pages.dev');

sandbox.__LANTERN_CARD_DEBUG_VISUAL__ = true;
if (Enf.allowVisualCounterfeitMark()) ok('debug flag enables visual counterfeit mark');
else bad('debug flag did not enable visual mark');
sandbox.__LANTERN_CARD_DEBUG_VISUAL__ = false;

/* Compositor: title-only HTML */
const cardSandbox = {
  console,
  document: {
    createElement() {
      const stub = {
        _html: '',
        firstElementChild: null,
        classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
        setAttribute(k, v) { stub['_' + k] = v; },
        getAttribute(k) { return stub['_' + k] || null; },
        querySelector(sel) {
          if (sel === '.exploreCard' && stub.firstElementChild) return stub.firstElementChild;
          return null;
        },
        set innerHTML(v) {
          stub._html = String(v || '');
          const m = stub._html.match(/^<(div|a)([^>]*)>([\s\S]*)<\/\1>$/);
          const cls = m ? ((m[2].match(/class="([^"]*)"/) || [])[1] || '') : '';
          stub.firstElementChild = {
            outerHTML: stub._html,
            classList: { _s: new Set(cls.split(/\s+/).filter(Boolean)), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
            setAttribute(k, val) { this['_' + k] = val; },
            getAttribute(k) { return this['_' + k] || null; },
            querySelector: () => null,
          };
        },
        get innerHTML() { return stub._html; },
      };
      return stub;
    },
  },
  window: undefined,
  LanternMedia: undefined,
  LANTERN_AVATAR_API: undefined,
  location: { href: '' },
  open: () => {},
};
cardSandbox.window = cardSandbox;
vm.createContext(cardSandbox);
vm.runInContext(cardsJs, cardSandbox);
const LC = cardSandbox.LanternCards;

function renderTitleOnly(title) {
  const spec = LC.specGameHubRailCard({
    title,
    hubIdentityLabel: '',
    metaOne: '',
    rewardText: '',
    typeBadge: '',
    fallbackType: 'mission',
    reportId: 'mission_test',
    extraClass: 'exploreCard--missionsLibrary missionsHubCard',
  });
  return LC.createStudentCard(spec).outerHTML || LC.createStudentCard(spec)._html || '';
}

['Thank-You Letter', 'Grade Reflection', 'Hidden Nugget', 'First Game Played'].forEach((t) => {
  const html = renderTitleOnly(t);
  if (new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(html) && /lanternCanonicalCardTitle/.test(html)) {
    ok(t + ' compositor renders headline');
  } else bad(t + ' compositor missing headline');
  const retired = 'can' + 'cer';
  if (!new RegExp(retired, 'i').test(html) && !/MISSING META/i.test(html) && !/createStudentCard/.test(html) && !/app\/js\//.test(html)) {
    ok(t + ' compositor has no diagnostic leakage');
  } else bad(t + ' compositor leaked diagnostics');
});

const emptyMetaHtml = renderTitleOnly('Thank-You Letter');
if (!/lanternCanonicalCardMeta/.test(emptyMetaHtml)) ok('empty reward/meta omits meta row in compositor');
else bad('empty meta still emitted meta row');

const withReward = LC.createStudentCard(
  LC.specGameHubRailCard({
    title: 'First Game Played',
    hubIdentityLabel: '',
    rewardText: '🟡 +1 Nugget',
    typeBadge: '',
    fallbackType: 'mission',
  })
);
const rewardHtml = withReward.outerHTML || withReward._html || '';
if (/lanternCanonicalCardMeta/.test(rewardHtml) && /\+1 Nugget/.test(rewardHtml)) {
  ok('reward meta still renders when present');
} else bad('reward meta missing when provided');

if (missionsPage.includes('specGameHubRailCard') && missionsPage.includes('createStudentCard')) {
  ok('Missions page still uses shared card compositor');
} else bad('missions shared compositor wiring');

console.log('\n--- card-counterfeit-contract-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
