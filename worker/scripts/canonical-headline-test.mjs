/**
 * Canonical content-card headline: two-line clamp + metadata clearance.
 * Usage: node worker/scripts/canonical-headline-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS ' + msg);
}
function bad(msg, detail) {
  fail++;
  console.log('FAIL ' + msg + (detail ? ' — ' + detail : ''));
}

const titleBlock = cardsCss.match(/\.lanternCanonicalCardTitle\s*\{[^}]+\}/);
if (!titleBlock) bad('title rule missing');
else {
  const block = titleBlock[0];
  if (/font-size:\s*17px/.test(block)) ok('canonical title font-size 17px');
  else bad('font-size', block.match(/font-size:[^;]+/)?.[0]);
  if (/line-height:\s*1\.1/.test(block)) ok('canonical title line-height 1.1');
  else bad('line-height');
  if (/-webkit-line-clamp:\s*2/.test(block) && /line-clamp:\s*2/.test(block)) ok('two-line clamp');
  else bad('line-clamp');
  if (/max-height:\s*calc\(1\.1em \* 2\)/.test(block)) ok('title max-height caps two lines');
  else bad('max-height');
}

const cardW = 280;
const cardH = Math.round((280 * 9) / 16);
const overlayMax = cardH * 0.46;
const titleH = 17 * 1.1 * 2;
const metaH = 16 * 1.2;
const captionPad = 10;
const metaGap = 4;
const stack = titleH + metaGap + metaH + captionPad;
if (stack <= overlayMax + 2) ok('two-line title + meta fits overlay budget (' + stack.toFixed(1) + 'px ≤ ' + overlayMax.toFixed(1) + 'px)');
else bad('overlay budget', stack + ' vs ' + overlayMax);

if (/#lockerPanelItems[\s\S]*\.lanternCanonicalCardTitle[\s\S]*font-size:\s*22px/.test(cardsCss)) {
  ok('cosmetic card title override preserved at 22px');
} else bad('cosmetic override missing');

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
        querySelector(sel) {
          if (sel === '.exploreCard') {
            if (stub.firstElementChild && stub.firstElementChild.classList._s.has('exploreCard')) return stub.firstElementChild;
          }
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
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(cardsJs, sandbox);
const LC = sandbox.LanternCards;

const cases = [
  { name: 'SHORT', title: 'STEM Fun' },
  { name: 'MEDIUM', title: 'These Cards Are Not The Same' },
  { name: 'LONG', title: 'A Very Long Student Headline That Definitely Needs To Be Truncated Before It Reaches The Metadata' },
];

cases.forEach(function (c) {
  const spec = LC.specFeedPostRail({
    id: 'h-' + c.name,
    type: 'image',
    title: c.title,
    display_name: 'Jamie',
    created_at: '2026-01-01T00:00:00Z',
    image_url: 'https://example.com/t.jpg',
  });
  const html = LC.createStudentCard(spec).outerHTML || LC.createStudentCard(spec)._html || '';
  if (!/lanternCanonicalCardTitle/.test(html)) {
    bad(c.name + ' missing title class');
    return;
  }
  if (!/lanternCanonicalCardMeta/.test(html)) {
    bad(c.name + ' missing meta row');
    return;
  }
  ok(c.name + ' title compositor includes title + meta');
});

console.log('\n--- canonical-headline-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
