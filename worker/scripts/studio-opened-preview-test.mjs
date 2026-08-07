/**
 * Contribute Studio layout + RIGHT production modal emulator tests.
 * Usage: node worker/scripts/studio-opened-preview-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardUiJs = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const finalRxJs = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const contributeHtml = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const streamGridJs = fs.readFileSync(path.join(root, 'app/js/lantern-studio-stream-grid.js'), 'utf8');
const previewScaleJs = fs.readFileSync(path.join(root, 'app/js/lantern-studio-opened-preview-scale.js'), 'utf8');

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

if (/--lantern-studio-center-width:\s*640px/.test(cardsCss)) ok('CENTER width token 640px');
else bad('CENTER width token');

if (!/--lantern-studio-right-col-width:\s*600px/.test(cardsCss)) ok('obsolete fixed 600px RIGHT removed');
else bad('fixed 600px RIGHT still present');

if (!/--lantern-studio-left-col-max:\s*600px/.test(cardsCss)) ok('obsolete LEFT max-600 removed');
else bad('LEFT max-600 still present');

if (!/--lantern-studio-left-col-width:\s*clamp\(/.test(cardsCss)) ok('obsolete LEFT clamp removed');
else bad('LEFT clamp still present');

if (/--lantern-studio-preview-min-scale:\s*0\.58/.test(cardsCss)) ok('RIGHT preview minimum scale token');
else bad('RIGHT preview min scale token');

if (/--lantern-studio-grid-card-max:\s*200px/.test(cardsCss)) ok('LEFT grid card maximum token');
else bad('LEFT grid max token');

if (
  /\.studioColLeft[\s\S]*left:\s*0;[\s\S]*right:\s*calc\(50vw \+ var\(--lantern-studio-center-half\) \+ var\(--lantern-studio-col-gap\)\)/.test(contributeHtml)
) {
  ok('LEFT pane edge-anchored to viewport left and CENTER gap');
} else bad('LEFT edge anchoring');

if (
  /\.studioColRight[\s\S]*left:\s*calc\(50vw \+ var\(--lantern-studio-center-half\) \+ var\(--lantern-studio-col-gap\)\)[\s\S]*right:\s*0;/.test(contributeHtml)
) {
  ok('RIGHT pane edge-anchored to CENTER gap and viewport right');
} else bad('RIGHT edge anchoring');

if (!/width:\s*var\(--lantern-studio-right-col-width\)/.test(contributeHtml)) {
  ok('no fixed RIGHT column width in layout');
} else bad('fixed RIGHT width still in layout');

if (!/width:\s*var\(--lantern-studio-left-col-width\)/.test(contributeHtml)) {
  ok('no explicit LEFT column width in layout');
} else bad('explicit LEFT width still in layout');

if (/\.studioColCenter[\s\S]*margin-left:\s*calc\(50vw - var\(--lantern-studio-center-half\)\)/.test(contributeHtml)) {
  ok('CENTER page-centered via 50vw minus half-width');
} else bad('CENTER page centering');

if (/@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.studioColCenter[\s\S]*margin-left:\s*calc\(50vw - var\(--lantern-studio-center-half\)\)/.test(contributeHtml)) {
  ok('desktop three-pane uses fine-pointer query not width breakpoint');
} else bad('fine-pointer desktop canvas');

if (/@media \(\(hover: none\) or \(pointer: coarse\)\) and \(max-width: 1199px\)/.test(contributeHtml)) {
  ok('touch/coarse narrow stack query');
} else bad('touch stack query');

if (!/@media \(max-width: 1199px\)\{[\s\S]*\.studioColCenter\{ order: -1/.test(contributeHtml)) {
  ok('width-only 1199px stack removed for desktop zoom');
} else bad('premature width-only stack still present');

if (/\.studioColRight[\s\S]*overflow-x:\s*hidden/.test(contributeHtml)) ok('RIGHT column hides horizontal overflow');
else bad('RIGHT overflow-x hidden');

if (!/studioOpenedHeroFrame|buildStudioOpenedHeroShell|--lantern-studio-opened-card-width/.test(cardsCss + cardUiJs)) {
  ok('obsolete 560px hero renderer removed');
} else bad('obsolete hero still present');

if (
  cardUiJs.includes('renderFeedItemDetailInto') &&
  cardUiJs.includes('fillFeedItemDetailModal') &&
  cardUiJs.includes('buildProductionDetailModalShell')
) {
  ok('shared production detail renderer exported');
} else bad('shared renderer missing');

if (
  cardUiJs.includes('mountStudioNewsOpenedInto') &&
  cardUiJs.includes('renderFeedItemDetailInto(container, studioNewsDraftToFeedItem')
) {
  ok('Studio news preview uses shared renderer');
} else bad('Studio news path');

if (
  cardUiJs.includes('studioCreationDraftToFeedItem') &&
  cardUiJs.includes('mode: \'studio-preview\'')
) {
  ok('one draft model feeds Studio preview');
} else bad('draft normalization');

if (finalRxJs.includes('mode === \'preview\'') && finalRxJs.includes('renderPreviewPanel')) {
  ok('reaction preview mode without API');
} else bad('reaction preview mode');

if (contributeHtml.includes('lantern-final-reactions.js')) ok('contribute loads final reactions');
else bad('contribute missing final reactions script');

if (contributeHtml.includes('lantern-studio-stream-grid.js') && contributeHtml.includes('id="studioStreamGrid"')) {
  ok('LEFT stream grid host + script');
} else bad('LEFT stream grid missing');

if (!/id="studioRailScroller"|studioRailScroller/.test(contributeHtml)) {
  ok('obsolete LEFT stream rail scroller removed');
} else bad('LEFT rail scroller still present');

if (/\.studioStreamGridScene[\s\S]*display:\s*grid/.test(contributeHtml)) {
  ok('3x3 stream grid scene CSS');
} else bad('3x3 grid scene CSS');

if (/\.studioStreamGridViewport[\s\S]*overflow:\s*hidden/.test(contributeHtml)) {
  ok('viewport overflow hidden for perimeter clip');
} else bad('viewport clip');

if (!/calc\(\(100%\s*-\s*6px\)\s*\/\s*3\s*\/\s*var\(--lantern-card-width\)/.test(contributeHtml + streamGridJs)) {
  ok('no fragile CSS length/length scale expression');
} else bad('fragile scale calc still present');

if (!/Mini feed|Your draft/i.test(contributeHtml)) ok('no explanatory subtitle or Your Draft label');
else bad('subtitle or draft label still present');

if (
  streamGridJs.includes('studioStreamGridViewport') &&
  streamGridJs.includes('studioStreamGridScene') &&
  streamGridJs.includes('ResizeObserver')
) {
  ok('viewport + scene + ResizeObserver architecture');
} else bad('viewport architecture');

if (
  streamGridJs.includes('CENTER_INDEX = 4') &&
  streamGridJs.includes('LANTERN_STUDIO_STREAM_GRID') &&
  streamGridJs.includes('specNewsRailCard')
) {
  ok('stream grid uses canonical card renderer');
} else bad('stream grid renderer');

if (streamGridJs.includes('getFallbackContextItems') && streamGridJs.includes('LANTERN_FEED')) {
  ok('stream grid feed fetch with deterministic fallback');
} else bad('stream grid data source');

if (contributeHtml.includes('renderStudioLeftDraft') && contributeHtml.includes('LANTERN_STUDIO_STREAM_GRID.mount')) {
  ok('draft updates wired to center grid tile');
} else bad('draft grid wiring');

if (contributeHtml.includes('lantern-feed-api.js')) ok('contribute loads feed API for context cards');
else bad('contribute missing feed API script');

if (contributeHtml.includes('lantern-studio-opened-preview-scale.js')) ok('RIGHT uniform scale script loaded');
else bad('RIGHT scale script missing');

if (
  cardUiJs.includes('wrapStudioPreviewForScale') &&
  cardUiJs.includes('scheduleStudioPreviewScale') &&
  cardUiJs.includes('studioOpenedPreviewScaleHost')
) {
  ok('Studio preview wraps canonical modal in scale stage');
} else bad('Studio scale wrapper missing');

if (/#studioOpenedPreviewInner \.studioOpenedPreviewScaleStage[\s\S]*transform-origin:\s*top left/.test(cardsCss)) {
  ok('RIGHT scale stage uses top-left origin for measured wrapper');
} else bad('RIGHT scale stage origin');

if (/#studioOpenedPreviewInner \.lanternCardDetailModal--studioPreview[\s\S]*width:\s*var\(--lantern-opened-content-max-width/.test(cardsCss)) {
  ok('RIGHT canonical modal stage uses production width token');
} else bad('RIGHT canonical width');

if (!/#studioOpenedPreviewInner \.lanternCardDetailModal--studioPreview[\s\S]*aspect-ratio:\s*16 \/ 9/.test(cardsCss)) {
  ok('obsolete independent studio media reflow removed');
} else bad('fluid studio media overrides still present');

if (!/#studioOpenedPreviewInner \.lanternCardDetailModal--studioPreview[\s\S]*min-width:\s*var\(--lantern-studio-modal-content-min/.test(cardsCss)) {
  ok('obsolete fluid modal min-width removed');
} else bad('fluid modal min-width still present');

if (previewScaleJs.includes('computeScale') && previewScaleJs.includes('MIN_SCALE = 0.58')) {
  ok('uniform scale helper with minimum floor');
} else bad('scale helper');

if (previewScaleJs.includes('scaleHost.style.height') && previewScaleJs.includes('ResizeObserver')) {
  ok('scaled height reservation + ResizeObserver');
} else bad('scaled wrapper geometry');

if (!/studioOpenedHero|studioOpenedPreviewShell/.test(cardUiJs)) ok('no duplicate Studio modal HTML builder');
else bad('duplicate Studio modal template');

const sandbox = {
  console,
  document: {
    createElement(tag) {
      const visual = { innerHTML: '', querySelectorAll() { return []; } };
      const title = { textContent: '' };
      const idw = { innerHTML: '' };
      const meta = { textContent: '' };
      const body = { innerHTML: '' };
      const actions = { innerHTML: '', appendChild() {} };
      const reactions = {
        innerHTML: '',
        appendChild() {},
        querySelector(sel) {
          if (sel === '.lanternFinalRxHost') return { innerHTML: '' };
          return null;
        },
      };
      const adm = { innerHTML: '', style: {} };
      const el = {
        tagName: String(tag || '').toUpperCase(),
        className: '',
        innerHTML: '',
        style: { setProperty() {} },
        clientWidth: 400,
        offsetHeight: 480,
        scrollHeight: 480,
        classList: { _s: new Set(), add(c) { this._s.add(c); el.className = [...this._s].join(' '); } },
        setAttribute() {},
        appendChild(child) { el.children = el.children || []; el.children.push(child); return child; },
        querySelectorAll() { return []; },
        addEventListener() {},
        children: [],
      };
      function walkQuery(node, sel) {
        if (!node) return null;
        if (sel.charAt(0) === '.' && node.className && node.className.split(/\s+/).includes(sel.slice(1))) return node;
        for (var i = 0; i < (node.children || []).length; i++) {
          var hit = walkQuery(node.children[i], sel);
          if (hit) return hit;
        }
        return null;
      }
      el.querySelector = function (sel) {
        if (sel === '.lanternCardDetailClose') return { addEventListener() {} };
        if (sel === '.lanternCardDetailVisual') return visual;
        if (sel === '.lanternCardDetailTitle') return title;
        if (sel === '.lanternCardDetailIdentityWrap') return idw;
        if (sel === '.lanternCardDetailMeta') return meta;
        if (sel === '.lanternCardDetailBody') return body;
        if (sel === '.lanternCardDetailActions') return actions;
        if (sel === '.lanternCardDetailReactions') return reactions;
        if (sel === '#lanternCardDetailAdminModeration') return adm;
        if (sel === '.lanternFinalRxHost') return null;
        return walkQuery(el, sel);
      };
      el.querySelectorAll = function (sel) {
        var one = el.querySelector(sel);
        return one ? [one] : [];
      };
      return el;
    },
  },
  LanternMedia: undefined,
  LANTERN_FINAL_REACTIONS: {
    mountFinalReactionPanel(container, opts) {
      sandbox._lastRxOpts = opts;
      container.innerHTML = '<div data-preview-rx="1"></div>';
    },
  },
  LanternCards: {
    TYPE_BADGES: { news: 'News', create: 'Create' },
    normalizeNewsMediaItemForExplore(n) { return n; },
    buildFeedPostParts(p) {
      return { model: { title: p.title, author: p.display_name, typeBadge: 'Create' } };
    },
  },
  location: { href: '' },
  getComputedStyle() {
    return { getPropertyValue(name) { return name === '--lantern-opened-content-max-width' ? '520px' : ''; } };
  },
  requestAnimationFrame(fn) { if (typeof fn === 'function') fn(); },
  setTimeout(fn) { if (typeof fn === 'function') fn(); },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(previewScaleJs, sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8'), sandbox);

const LUI = sandbox.LanternCardUI;
if (LUI && LUI.renderFeedItemDetailInto) {
  const container = sandbox.document.createElement('div');
  LUI.renderFeedItemDetailInto(container, {
    id: 'preview-draft',
    type: 'photo',
    typeLabel: 'School News',
    title: 'STEM Fun',
    body: 'Description here',
    authorDisplayName: 'Jamie',
    createdAt: new Date().toISOString(),
    imageUrl: 'https://example.com/a.jpg',
    thumbnailUrl: 'https://example.com/a.jpg',
  }, { mode: 'studio-preview' });
  const html = container.children && container.children[0] ? container.children[0].className : '';
  if (/studioOpenedPreviewScaleHost/.test(html)) ok('sandbox wraps studio preview in scale host');
  else bad('sandbox scale host', html);
  const modalNode = container.querySelector && container.querySelector('.lanternCardDetailModal--studioPreview');
  if (modalNode) ok('sandbox renders studio preview modal class');
  else bad('sandbox studio class');
  if (sandbox._lastRxOpts && sandbox._lastRxOpts.mode === 'preview') ok('sandbox preview skips reaction API');
  else bad('sandbox reaction opts');
} else bad('LanternCardUI sandbox load');

vm.runInContext(streamGridJs, sandbox);
const SG = sandbox.LANTERN_STUDIO_STREAM_GRID;
if (SG && typeof SG.computeLayout === 'function') {
  const pad = 12;
  const sideAt = (vw) => SG.computeSidePaneWidth(vw, pad);
  const widePane = sideAt(2000);
  const normalPane = sideAt(1366);
  const zoomPane = sideAt(1090);
  if (widePane >= 620 && widePane <= 660) ok('wide ~2000px side panes ~636px each');
  else bad('wide side width', String(widePane));
  if (normalPane >= 300 && normalPane <= 330) ok('1366px side panes ~319px each');
  else bad('1366 side width', String(normalPane));
  if (zoomPane >= 170 && zoomPane <= 195) ok('1090px side panes ~181px each');
  else bad('1090 side width', String(zoomPane));
  if (Math.abs(widePane - normalPane) > 200) ok('wide side panes expand beyond 1366');
  else bad('wide expansion', widePane + ' vs ' + normalPane);

  const wideGrid = SG.computeLayout(widePane - 16, 500);
  if (wideGrid.cardW === SG.MAX_CARD_DISPLAY_WIDTH) ok('wide LEFT mini cards capped at max');
  else bad('wide card max', String(wideGrid.cardW));
  const normalGrid = SG.computeLayout(normalPane - 16, 400);
  if (normalGrid.cardW >= 96 && normalGrid.cardW <= 110) ok('1366 LEFT mini cards ~96-110px');
  else bad('normal card width', String(normalGrid.cardW));

  const expectedH = wideGrid.cardW * (SG.CANONICAL_CARD_HEIGHT / SG.CANONICAL_CARD_WIDTH);
  if (Math.abs(wideGrid.cardH - expectedH) < 0.01) ok('wrapper reserves correct 16:9 height');
  else bad('16:9 height', wideGrid.cardH + ' vs ' + expectedH);
  if (wideGrid.sceneW === 3 * wideGrid.cardW + 2 * SG.GRID_GAP) ok('scene width deterministic');
  else bad('scene width');
  const tight = SG.computeLayout(120, 200);
  if (tight.cardW === SG.MIN_CARD_DISPLAY_WIDTH && tight.clipsHorizontally) {
    ok('below minimum width clips instead of shrinking');
  } else bad('clip floor', JSON.stringify(tight));
  if (SG.CENTER_INDEX === 4) ok('center draft is grid slot 5');
  else bad('center slot');
  if (!streamGridJs.includes('LEFT_PANE_MAX = 600')) ok('obsolete LEFT_PANE_MAX removed');
  else bad('LEFT_PANE_MAX still present');
  if (streamGridJs.includes('MAX_CARD_W = 200')) ok('LEFT grid card max constant');
  else bad('MAX_CARD_W missing');
  if (streamGridJs.includes('computeSidePaneWidth')) ok('symmetric side pane width helper');
  else bad('computeSidePaneWidth missing');

  if (typeof SG.computeDraftFocusScale === 'function') ok('draft focus scale helper');
  else bad('computeDraftFocusScale missing');
  if (SG.DRAFT_FOCUS_SCALE_MAX === 1.25) ok('draft focus target ~1.25x');
  else bad('draft focus max', String(SG.DRAFT_FOCUS_SCALE_MAX));
  if (wideGrid.draftFocusScale > 1 && wideGrid.draftFocusScale <= 1.25) ok('wide draft visually larger than perimeter');
  else bad('wide draft focus', String(wideGrid.draftFocusScale));
  if (Math.abs(wideGrid.draftDisplayW - wideGrid.cardW * wideGrid.draftFocusScale) < 0.01) {
    ok('draft display width preserves 16:9 focal scale');
  } else bad('draft display width');
  if (Math.abs(wideGrid.draftDisplayH / wideGrid.draftDisplayW - SG.CANONICAL_CARD_HEIGHT / SG.CANONICAL_CARD_WIDTH) < 0.001) {
    ok('draft focal enlargement preserves 16:9');
  } else bad('draft 16:9');
  if (wideGrid.draftDisplayW > wideGrid.cardW + 0.5) ok('center draft display exceeds perimeter width');
  else bad('draft not larger than perimeter');
  if (wideGrid.sceneW === 3 * wideGrid.cardW + 2 * SG.GRID_GAP && wideGrid.draftFocusScale > 1) {
    ok('grid scene geometry unchanged by draft enlargement');
  } else bad('scene reflowed');
  const tightFocus = SG.computeDraftFocusScale(SG.MIN_CARD_DISPLAY_WIDTH);
  if (tightFocus === 1) ok('extreme narrow draft focus tapers to 1x');
  else bad('tight draft focus', String(tightFocus));
} else bad('computeLayout export');

if (/\.studioStreamGridCardFit--draft[\s\S]*transform-origin:\s*center center/.test(contributeHtml)) {
  ok('draft enlargement uses center transform origin');
} else bad('draft transform origin');

if (/\.studioStreamGridCell--draft[\s\S]*z-index:\s*2/.test(contributeHtml)) {
  ok('draft cell stacks above perimeter');
} else bad('draft z-index');

if (/--studio-grid-draft-focus-scale/.test(contributeHtml + streamGridJs)) {
  ok('draft focus scale CSS variable wired');
} else bad('draft focus variable');

if (!/\.studioStreamGridCardFit--draft::before/.test(contributeHtml)) {
  ok('oversized radial draft pseudo-element removed');
} else bad('radial draft pseudo still present');

if (/\.studioStreamGridCell--draft \.studioScrollerCardActive[\s\S]*box-shadow:/.test(contributeHtml)) {
  ok('tight card-local draft glow via box-shadow');
} else bad('card-local glow');

const SPS = sandbox.LANTERN_STUDIO_OPENED_PREVIEW_SCALE;
if (SPS && typeof SPS.computeScale === 'function') {
  if (SPS.computeScale(520, 520) === 1) ok('RIGHT scale max is 1 at canonical width');
  else bad('scale max', String(SPS.computeScale(520, 520)));
  if (Math.abs(SPS.computeScale(364, 520) - 364 / 520) < 0.001) ok('RIGHT uniform scale shrinks proportionally');
  else bad('proportional scale', String(SPS.computeScale(364, 520)));
  if (SPS.computeScale(100, 520) === SPS.MIN_SCALE) ok('RIGHT scale floor stops below minimum');
  else bad('scale floor', String(SPS.computeScale(100, 520)));
} else bad('LANTERN_STUDIO_OPENED_PREVIEW_SCALE export');

console.log('\n--- studio-opened-preview-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
