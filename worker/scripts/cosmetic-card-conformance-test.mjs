/**
 * Cosmetic Items/Store cards must satisfy Lantern canonical contract v2.
 * Usage: node worker/scripts/cosmetic-card-conformance-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsPath = path.join(root, 'app/js/lantern-cards.js');
const enforcePath = path.join(root, 'app/js/lantern-canonical-enforce.js');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const storeCss = fs.readFileSync(path.join(root, 'app/css/lantern-store-panel.css'), 'utf8');
const dataJs = fs.readFileSync(path.join(root, 'app/js/lantern-data.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

const catalogEntries = [...dataJs.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*category:\s*'([^']+)'/g)].map((m) => ({
  id: m[1],
  name: m[2],
  category: m[3],
}));

if (catalogEntries.length > 40) ok('DEFAULT_COSMETICS catalog loaded');
else bad('DEFAULT_COSMETICS extract', String(catalogEntries.length));

const sandbox = {
  console,
  document: {
    createElement() {
      const stub = {
        _html: '',
        firstElementChild: null,
        classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
        setAttribute(k, v) { stub['_' + k] = v; },
        getAttribute(k) { return stub['_' + k] || null; },
        set innerHTML(v) {
          stub._html = String(v || '');
          const rootMatch = stub._html.match(/^<(div|a)([^>]*)>([\s\S]*)<\/\1>$/);
          const attrs = rootMatch ? rootMatch[2] : '';
          const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
          const child = {
            outerHTML: stub._html,
            classList: { _s: new Set(cls.split(/\s+/).filter(Boolean)), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); } },
            setAttribute(k, val) { child['_' + k] = val; },
            getAttribute(k) {
              if (child['_' + k] != null) return child['_' + k];
              const re = new RegExp(k.replace(/-/g, '\\-') + '="([^"]*)"');
              const m = attrs.match(re);
              return m ? m[1] : null;
            },
            offsetWidth: 280,
            offsetHeight: Math.round(280 / (16 / 9)),
            getBoundingClientRect() { return { width: 280, height: Math.round(280 / (16 / 9)) }; },
            querySelector(sel) {
              if (sel === ':scope > .lanternCanonicalCardFrame' || sel === '.lanternCanonicalCardFrame') {
                return {
                  querySelector(inner) {
                    if (inner === '.lanternCanonicalCardImage') return { style: { objectFit: 'cover' } };
                    if (inner === '.lanternCanonicalCardFallback') return {};
                    if (inner === '.lanternCanonicalCardOverlay') return {};
                    if (inner === '.lanternCanonicalCardGradient') return {};
                    if (inner === '.lanternCanonicalCardCaption') return {};
                    if (inner === '.lanternCanonicalCardTitle') return { scrollHeight: 26, clientHeight: 26, style: { webkitLineClamp: '2', lineHeight: '26px', fontSize: '22px' } };
                    if (inner === '.lanternCanonicalCardMeta') return { scrollHeight: 18, clientHeight: 18, style: {} };
                    return null;
                  },
                  querySelectorAll(inner) {
                    if (inner === '.lanternCanonicalCardTitle') return [{ scrollHeight: 26, clientHeight: 26, style: { webkitLineClamp: '2', lineHeight: '26px', fontSize: '22px' } }];
                    return [];
                  },
                };
              }
              return null;
            },
            ownerDocument: { documentElement: { style: {} } },
          };
          stub.firstElementChild = child;
          return child;
        },
        get innerHTML() { return stub._html; },
      };
      return stub;
    },
    body: {},
    documentElement: { style: { setProperty() {} } },
  },
  window: undefined,
  getComputedStyle() {
    return {
      getPropertyValue(prop) {
        if (prop === '--lantern-card-width') return '280px';
        return '';
      },
      objectFit: 'cover',
      webkitLineClamp: '2',
      lineHeight: '26px',
      fontSize: '22px',
      display: 'block',
      visibility: 'visible',
    };
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(cardsPath, 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(enforcePath, 'utf8'), sandbox);
const LC = sandbox.LanternCards;
const Enforce = sandbox.LanternCanonicalEnforce;

const CATEGORY_SAMPLES = {
  background: 'bg_stars',
  frame: 'frame_gold',
  decoration: 'dec_sparkles',
  accent: 'accent_gold',
  badge: 'badge_star',
  accessory: 'acc_hat',
};

function buildCosmeticSpec(c) {
  return LC.specCosmeticRailCard({
    title: c.name || c.id,
    icon: '✨',
    identityLabel: 'Locker',
    rarityKey: String(c.rarity || 'common').toLowerCase(),
    rarityLabel: 'Common',
    subline: 'Owned · Tap card to equip',
    stateOwned: true,
    reportId: c.id,
    dataAttrs: { 'cosmetic-id': String(c.id) },
  });
}

catalogEntries.forEach(function (c) {
  const el = LC.createStudentCard(buildCosmeticSpec(c));
  const card = el && el.classList && el.classList.contains('exploreCard') ? el : el;
  if (!card || !card.classList.contains('exploreCard')) {
    bad('createStudentCard cosmetic: ' + c.id);
    return;
  }
  card.setAttribute('data-lantern-card-surface', 'face');
  const result = Enforce.inspectExploreCard(card);
  if (result.ok) ok('cosmetic contract v2: ' + c.category + ' / ' + c.id);
  else bad('cosmetic contract v2: ' + c.id, result.reasons.join(', '));
});

Object.keys(CATEGORY_SAMPLES).forEach(function (cat) {
  const id = CATEGORY_SAMPLES[cat];
  const c = catalogEntries.find((x) => x.id === id);
  if (!c) return bad('sample missing ' + cat);
  const html = LC.createStudentCard(buildCosmeticSpec(c)).outerHTML || '';
  if (/exploreCard--cosmeticRail/.test(html) && /lanternCanonicalCard/.test(html) && /data-lantern-card-contract-version="2"/.test(html)) {
    ok('cosmetic renderer category: ' + cat);
  } else bad('cosmetic renderer category: ' + cat);
});

if (!/#lockerPanelItems[\s\S]*?align-items:\s*stretch/.test(lockerHtml)) ok('Items rails do not stretch card cross-axis');
else bad('Items rails still use align-items: stretch');

if (/align-items:\s*flex-start/.test(lockerHtml) && lockerHtml.includes('#lockerPanelItems .lanternScroller')) {
  ok('Items rails use align-items: flex-start');
} else bad('Items rails flex-start');

if (/\.exploreCard--cosmeticRail\.lanternCanonicalCard[\s\S]*aspect-ratio:\s*var\(--lantern-card-aspect-ratio\)/.test(cardsCss)) {
  ok('cosmetic canonical cards keep 16:9 aspect ratio in CSS');
} else bad('cosmetic canonical aspect-ratio CSS');

if (/\.exploreCard--cosmeticRail\.lanternCanonicalCard[\s\S]*flex:\s*0\s*0\s*var\(--lantern-card-width\)/.test(cardsCss)) {
  ok('cosmetic canonical cards use fixed 280px rail width');
} else bad('cosmetic canonical fixed width');

if (/#lockerPanelItems[\s\S]*align-self:\s*flex-start/.test(cardsCss)) ok('Items cosmetic cards align-self flex-start');
else bad('Items cosmetic align-self');

if (/#lockerPanelStore[\s\S]*align-items:\s*flex-start/.test(storeCss)) ok('Store rails use flex-start');
else bad('Store rails flex-start');

if (!/\.cosmeticCard\s*\{[^}]*width:/.test(cardsCss)) ok('no independent .cosmeticCard width geometry');
else bad('independent cosmeticCard geometry detected');

console.log('\n--- cosmetic-card-conformance-test:', pass, 'passed,', fail, 'failed ---');
process.exit(fail ? 1 : 0);
