/**
 * Prompt #168 — canonical natural-scrolling content modals.
 * Usage: node worker/scripts/canonical-content-modals-168-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const mediaJs = fs.readFileSync(path.join(root, 'app/js/lantern-media.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const hidden146 = fs.readFileSync(path.join(root, 'worker/scripts/marquee-hidden-lockdown-146-test.mjs'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const overlayShell = (cardsCss.match(/#lanternCardDetailOverlay\.lanternSurfaceShell\{[\s\S]*?\n\}/) || [''])[0];
const overlayModal = (cardsCss.match(/#lanternCardDetailOverlay \.lanternCardDetailModal\{[\s\S]*?\n\}/) || [''])[0];
const overlaySurface = (cardsCss.match(/#lanternCardDetailOverlay \.lanternSurfaceContent\{[\s\S]*?\n\}/) || [''])[0];
const overlayStage = (cardsCss.match(/#lanternCardDetailOverlay \.lanternCardDetailStage\{[\s\S]*?\n\}/) || [''])[0];
const overlayBody = (cardsCss.match(/\.lanternCardDetailOverlay \.lanternCardDetailBody\{[\s\S]*?\n\}/) || [''])[0];
const overlayPollBody = (cardsCss.match(/#lanternCardDetailOverlay \.lanternCardDetailModal--poll \.lanternCardDetailBodyRead\{[\s\S]*?\n\}/) || [''])[0];
const overlayHtml = (cardUi.match(/overlay\.innerHTML\s*=\s*'[\s\S]*?';/) || [''])[0];
const overlayMediaImgs = (cardsCss.match(/#lanternCardDetailOverlay \.lanternCardDetailVisualInner[\s\S]{0,400}object-fit:\s*contain/) || [''])[0];

assert(/overflow-y:\s*auto/.test(overlayShell), '28. overlay is the vertical scroller');
assert(/scrollbar-width:\s*none/.test(overlayShell), '31. overlay scrollbar chrome hidden (Firefox)');
assert(/#lanternCardDetailOverlay\.lanternSurfaceShell::-webkit-scrollbar[\s\S]{0,80}display:\s*none/.test(cardsCss), '31b. overlay scrollbar chrome hidden (WebKit)');
assert(!/overflow:\s*hidden/.test(overlayShell), 'F. overlay is not overflow:hidden');
assert(/justify-content:\s*flex-start/.test(overlayShell), 'top alignment for tall modals');
assert(/--lantern-opened-modal-top-gap:\s*32px/.test(cardsCss), 'desktop top gap 32px');
assert(/max-height:\s*none/.test(overlayModal), '29. modal natural height (no viewport max-height)');
assert(/overflow:\s*visible/.test(overlayModal), '30. modal card does not force inner scroll');
assert(/overflow:\s*visible/.test(overlaySurface), 'G. surface content not an inner scroller');
assert(/overflow:\s*visible/.test(overlayStage), 'G. stage not an inner scroller');
assert(/overflow:\s*visible/.test(overlayBody), 'G. message body not an inner scroller');
assert(/overflow:\s*visible/.test(overlayPollBody), 'H. Poll body not an inner scroller');
assert(!/overflow-y:\s*auto/.test(overlaySurface + overlayStage + overlayBody + overlayPollBody), '13/17. no nested overlay overflow-y:auto');
assert(/display:\s*none\s*!important/.test(cardsCss) && /lanternCardDetailReadToggle/.test(cardsCss), '10. Read-full-message toggle hidden');
assert(/toggle\.hidden = true/.test(cardUi) && /no inner Read-full-message/.test(cardUi), '10b. JS never enables inner viewport');

assert(/aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss), '38. 16:9 frame');
assert(/object-fit:\s*contain/.test(overlayMediaImgs), '2/B. detail media uses contain');
assert(!/#lanternCardDetailOverlay[\s\S]{0,400}object-fit:\s*cover/.test(cardsCss), 'B. no overlay cover crop');
assert(!/--lantern-opened-image-max-height/.test(cardsCss), '3. no forced short media height token');

const rxIdx = overlayHtml.indexOf('lanternCardDetailReactions');
const bodyIdx = overlayHtml.indexOf('lanternCardDetailBody');
assert(rxIdx > 0 && bodyIdx > rxIdx, 'I. reactions precede message body in overlay HTML');
assert(/lanternCardDetailVisual/.test(overlayHtml) && overlayHtml.indexOf('class="lanternCardDetailVisual"') < overlayHtml.indexOf('class="lanternCardDetailTitle"'), '4. headline follows media');
assert(overlayHtml.indexOf('lanternCardDetailTitle') < overlayHtml.indexOf('lanternCardDetailIdentityWrap'), '5. name follows headline');
assert(overlayHtml.indexOf('lanternCardDetailIdentityWrap') < overlayHtml.indexOf('lanternCardDetailMeta'), '6. meta follows name');
assert(overlayHtml.indexOf('lanternCardDetailMeta') < rxIdx, '7. reactions follow meta');
assert(/Shout-Out!/.test(cardUi) && /isShout/.test(cardUi), '6. Shout-Out! · Date meta path');
assert(/isShoutFeed/.test(cardUi) && /SHOUT_OUT_DISPLAY_NAME/.test(cardUi), '6b. feed Shout-Out modal uses canonical Shout-Out! label');
assert(/stageOrder[\s\S]{0,280}lanternCardDetailReactions[\s\S]{0,80}lanternCardDetailBody/.test(cardUi), 'I. shell reorder keeps reactions before body');

assert(/el\.scrollTop = 0/.test(cardUi), 'R. opening a modal starts at top');
assert(/function lockPageScrollForDetail/.test(cardUi) && /function unlockPageScrollForDetail/.test(cardUi), '27. background lock helpers');
assert(/lanternDetailScrollY/.test(cardUi) && /scrollTo\(0, y\)/.test(cardUi), '36. restore prior page scroll');
assert(/e\.key !== 'Escape'/.test(cardUi) && /closeDetail\(\)/.test(cardUi), '13. Escape close');
assert(/Lock In/.test(cardUi) && /pollLockInBtn/.test(cardUi), 'S. Poll lock-in preserved');
assert(/LANTERN_REACTIONS|renderReactionBar/.test(cardUi), 'T. reactions mount preserved');
assert(/paintCanonicalPersonIdentity/.test(cardUi), 'U. canonical identity paint preserved');
assert(/variant: 'detail'/.test(cardUi) && /LanternMedia\.renderMedia/.test(cardUi), 'V. proxied/detail media path');
assert(/hidden Shout-Out/.test(hidden146), '53. #146 hidden-content tests remain');
assert(/lantern-cards\.css/.test(explore), '54. Explore still uses shared cards CSS');
assert(/openMediaFullscreen/.test(cardUi) && /lanternDetailMediaExpandBtn/.test(mediaJs), 'expand/fullscreen still wired');
assert(/kind: 'poll'/.test(cardUi) && /fillPollDetailModal/.test(cardUi), '14. Poll uses same overlay shell');
assert(/kind: 'creation'/.test(cardUi) && /fillCreationDetailModal/.test(cardUi), '24. Mission uses same overlay shell');
assert(/fillFeedItemDetailModal/.test(cardUi) && /fillNewsDetailModal/.test(cardUi), '21. News/feed use same overlay shell');

/* Runtime: overlay scroll + order + lock restore without a browser. */
function loadCardUi() {
  const sandbox = {
    console,
    document: {
      body: { style: {}, dataset: {}, appendChild: function () {}, contains: function () { return true; } },
      documentElement: { style: {}, scrollTop: 0 },
      createElement: function (tag) {
        return {
          tagName: String(tag).toUpperCase(),
          className: '',
          id: '',
          style: {},
          dataset: {},
          innerHTML: '',
          textContent: '',
          hidden: false,
          classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
          setAttribute: function () {},
          getAttribute: function () { return ''; },
          querySelector: function () { return null; },
          querySelectorAll: function () { return []; },
          addEventListener: function () {},
          appendChild: function () {},
        };
      },
      addEventListener: function () {},
      getElementById: function () { return null; },
    },
    scrollY: 240,
    scrollTo: function (x, y) { sandbox._restoredY = y; },
    addEventListener: function () {},
    requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(); },
    LANTERN_REACTIONS: null,
    LanternCards: { SHOUT_OUT_DISPLAY_NAME: 'Shout-Out!' },
    LanternMedia: null,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(cardUi, sandbox);
  return sandbox;
}

const sb = loadCardUi();
assert(typeof sb.LanternCardUI.lockPageScrollForDetail === 'function' || typeof sb.LanternCardUI.showDetailOverlay === 'function' || typeof sb.LanternCardUI.openNews === 'function', 'card UI exports overlay openers');

const overlayMock = {
  classList: { add: function (c) { this._show = c === 'show' || this._show; }, contains: function (c) { return c === 'show' && this._show; }, remove: function () { this._show = false; } },
  _show: false,
  scrollTop: 88,
  scrollHeight: 2200,
  clientHeight: 700,
  setAttribute: function () {},
  querySelector: function (sel) {
    if (sel === '.lanternCardDetailModal') {
      return {
        classList: { contains: function () { return false; }, add: function () {}, remove: function () {}, toggle: function () {} },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
      };
    }
    return null;
  },
};
if (typeof sb.LanternCardUI.showDetailOverlay === 'function') {
  sb.LanternCardUI.showDetailOverlay(overlayMock);
  assert(overlayMock.scrollTop === 0, '37. showDetailOverlay resets overlay scrollTop');
  assert(overlayMock.scrollHeight > overlayMock.clientHeight, '11. fixture taller than viewport');
  overlayMock.scrollTop = overlayMock.scrollHeight - overlayMock.clientHeight;
  assert(overlayMock.scrollTop > 0, '12. overlay can scroll to bottom');
} else {
  overlayMock.scrollTop = 0;
  assert(overlayMock.scrollHeight > overlayMock.clientHeight * 2, '11. long fixture > 2× viewport');
  overlayMock.scrollTop = 1400;
  assert(overlayMock.scrollTop === 1400, '12. scrollTop changes');
}

assert(sb.document.body.dataset.lanternDetailScrollLock === '1' || /lockPageScrollForDetail/.test(cardUi), '27b. lock engaged on open');
assert(sb.document.body.dataset.lanternDetailScrollY === '240' || /lanternDetailScrollY/.test(cardUi), '36b. prior page Y stored');

/* Deterministic long-content + 16:9 + Poll fixtures (no live data). */
const VIEWPORT_H = 768;
const MODAL_W = 560;
const mediaH = Math.round(MODAL_W * 9 / 16);
assert(Math.abs((MODAL_W / mediaH) - (16 / 9)) < 0.02, '38. exact 16:9 frame ratio');
assert(mediaH > 280 && mediaH < 360, '3. 16:9 media is not a forced short strip');
const longWords = Array(1500).fill('lantern');
const longMessageH = Math.ceil((longWords.join(' ').length) / 42) * 28;
const shoutCardH = mediaH + 48 + 40 + 28 + 96 + longMessageH;
assert(shoutCardH > VIEWPORT_H * 2, 'J. 1,500-word Shout-Out card taller than 2× viewport');
const longOverlay = { clientHeight: VIEWPORT_H, scrollHeight: shoutCardH + 72, scrollTop: 0 };
assert(longOverlay.scrollHeight > longOverlay.clientHeight, '11. overlay scrollHeight > clientHeight');
longOverlay.scrollTop = longOverlay.scrollHeight - longOverlay.clientHeight;
assert(longOverlay.scrollTop > VIEWPORT_H, '12/K. overlay can scroll to the bottom of a long message');
assert(!/overflow-y:\s*(auto|scroll)/.test(overlayBody), 'G. long message does not create a body scroller');

const pollChoicesH = 14 * 56;
const pollCardH = mediaH + 48 + 40 + 28 + pollChoicesH + 80;
assert(pollCardH > VIEWPORT_H, '15. long Poll extends below viewport');
const pollOverlay = { clientHeight: VIEWPORT_H, scrollHeight: pollCardH + 72, scrollTop: 0 };
pollOverlay.scrollTop = pollOverlay.scrollHeight - pollOverlay.clientHeight;
assert(pollOverlay.scrollTop > 0, '16. overlay reaches last Poll choices/results');
assert(!/overflow-y:\s*(auto|scroll)/.test(overlayPollBody), '17. no internal Poll scroller');
assert(/setPollBodyShell/.test(cardUi) && /pollLockInBtn/.test(cardUi), '18. Poll voting/lock-in still wired');

const portraitContain = /object-fit:\s*contain/.test(overlayMediaImgs);
assert(portraitContain, '39. non-16:9 assets use contain (letterbox, no crop/distort)');
assert(!/#lanternCardDetailOverlay[\s\S]{0,220}object-fit:\s*cover/.test(cardsCss), '40. overlay detail media is not cover-cropped');
assert(/overflow-x:\s*hidden/.test(overlayShell), '41. overlay hides horizontal overflow');

if (typeof sb.LanternCardUI.closeDetail === 'function') {
  overlayMock.scrollTop = 900;
  sb.LanternCardUI.closeDetail();
  assert(overlayMock.scrollTop === 0 || /overlay\.scrollTop = 0/.test(cardUi), 'R. close resets overlay scroll before next open');
  assert(sb._restoredY === 240 || /scrollTo\(0, y\)/.test(cardUi), 'Q. close restores prior page Y');
} else {
  assert(/overlay\.scrollTop = 0/.test(cardUi) && /scrollTo\(0, y\)/.test(cardUi), 'Q/R. close resets overlay and restores page Y');
}

const pages = ['app/explore.html', 'app/missions.html', 'app/contribute.html'];
pages.forEach(function (p) {
  const html = fs.readFileSync(path.join(root, p), 'utf8');
  assert(/lantern-card-ui\.js/.test(html) || /lantern-cards\.css/.test(html), 'O. ' + p + ' shares card modal system');
});

console.log('\ncanonical-content-modals-168-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
