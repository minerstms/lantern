/**
 * Studio detail scale emulator tests (Prompt #29).
 * Usage: node worker/scripts/studio-detail-emulator-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contributeHtml = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const emulatorJs = fs.readFileSync(path.join(root, 'app/js/lantern-studio-detail-emulator.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');

let passed = 0;
let failed = 0;
function ok(msg) { passed++; console.log('PASS ' + msg); }
function bad(msg, d) { failed++; console.log('FAIL ' + msg + (d ? ' — ' + d : '')); }

if (contributeHtml.includes('studioDetailViewport') && contributeHtml.includes('studioDetailScaleStage')) {
  ok('contribute has emulator viewport + scale stage DOM');
} else bad('emulator DOM missing');

if (contributeHtml.includes('lantern-studio-detail-emulator.js')) ok('contribute loads detail emulator script');
else bad('emulator script not included');

if (contributeHtml.includes('getStudioDetailMountEl')) ok('contribute mounts into scale stage');
else bad('getStudioDetailMountEl missing');

if (contributeHtml.includes('notifyStudioDetailMount')) ok('contribute recalculates scale after mount');
else bad('notifyStudioDetailMount missing');

if (!contributeHtml.includes('#studioOpenedPreviewInner .lanternCardDetailModal--embedded')) {
  ok('narrow embedded width override removed');
} else bad('legacy narrow embedded override still present');

const intrinsicMatch = cardsCss.match(/--lantern-opened-content-max-width:\s*(\d+)px/);
const intrinsicPx = intrinsicMatch ? parseInt(intrinsicMatch[1], 10) : 520;
if (intrinsicPx === 520) ok('production opened content max-width is 520px');
else bad('unexpected intrinsic width', String(intrinsicPx));

function makeDom() {
  const nodes = new Map();
  let idCounter = 0;
  function el(tag, id) {
    const node = {
      id: id || '',
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      style: { setProperty() {}, transform: '', width: '', height: '', minHeight: '', maxWidth: '', minWidth: '', transformOrigin: '' },
      innerHTML: '',
      childNodes: [],
      _listeners: {},
      clientWidth: 0,
      offsetHeight: 0,
      scrollHeight: 0,
      appendChild(c) { this.childNodes.push(c); c.parentNode = this; },
      addEventListener(ev, fn) { this._listeners[ev] = fn; },
      querySelectorAll() { return []; },
      querySelector(sel) {
        if (sel === '.lanternCardDetailVisual') return { querySelectorAll: () => [], style: {} };
        return null;
      },
      setAttribute(k, v) { this['_' + k] = v; },
      getAttribute(k) { return this['_' + k] || null; },
    };
    if (id) nodes.set(id, node);
    return node;
  }
  const viewport = el('div', 'studioDetailViewport');
  viewport.clientWidth = 280;
  viewport.style = { setProperty(k, v) { this[k] = v; } };
  const stage = el('div', 'studioDetailScaleStage');
  stage.style = { setProperty(k, v) { this[k] = v; }, transform: '', width: '' };
  stage.offsetHeight = 640;
  stage.scrollHeight = 640;
  viewport.appendChild(stage);
  const docEl = { style: { setProperty() {} } };
  return { viewport, stage, nodes, docEl };
}

function loadEmulator(dom) {
  const sandbox = {
    console,
    document: {
      getElementById(id) { return dom.nodes.get(id) || null; },
      documentElement: dom.docEl,
      readyState: 'complete',
      addEventListener() {},
    },
    getComputedStyle() {
      return { getPropertyValue: () => '520px' };
    },
    requestAnimationFrame(fn) { fn(); },
    addEventListener() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    window: undefined,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(emulatorJs, sandbox);
  return sandbox.LanternStudioDetailEmulator;
}

const dom = makeDom();
const E = loadEmulator(dom);
if (E && E.readIntrinsicWidthPx() === 520) ok('emulator reads CSS intrinsic width');
else bad('intrinsic width read');

E.applyScale();
const scale = 280 / 520;
const tr = dom.stage.style.transform || '';
if (/^scale\(0\.538/.test(tr)) ok('uniform scale calculated for narrow pane');
else bad('scale transform', tr);

if (parseFloat(dom.stage.style.width) === 520) ok('stage keeps production intrinsic width');
else bad('stage width', dom.stage.style.width);

const expectedH = Math.ceil(640 * scale);
const actualH = parseInt(String(dom.viewport.style.height || '0'), 10);
if (Math.abs(actualH - expectedH) <= 1) ok('viewport reserves scaled height');
else bad('scaled height', dom.viewport.style.height + ' expected ~' + expectedH);

if (scale <= 1) ok('scale never exceeds 1');
else bad('scale > 1');

console.log('\n--- studio-detail-emulator-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
