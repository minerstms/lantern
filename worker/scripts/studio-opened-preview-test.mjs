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

if (/--lantern-studio-modal-content-min:\s*280px/.test(cardsCss)) ok('RIGHT modal content minimum token');
else bad('RIGHT modal min token');

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

if (/#studioOpenedPreviewInner \.lanternCardDetailModal--studioPreview[\s\S]*aspect-ratio:\s*16 \/ 9/.test(cardsCss)) {
  ok('Studio preview media preserves 16:9 aspect ratio');
} else bad('Studio preview aspect-ratio fix');

if (/#studioOpenedPreviewInner \.lanternCardDetailModal--studioPreview[\s\S]*min-width:\s*var\(--lantern-studio-modal-content-min/.test(cardsCss)) {
  ok('Studio preview modal minimum useful width');
} else bad('Studio preview modal min width');

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
        classList: { _s: new Set(), add(c) { this._s.add(c); el.className = [...this._s].join(' '); } },
        setAttribute() {},
        appendChild(child) { el.children = el.children || []; el.children.push(child); return child; },
        querySelector(sel) {
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
          return null;
        },
        querySelectorAll() { return []; },
        addEventListener() {},
        children: [],
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
};
sandbox.window = sandbox;
vm.createContext(sandbox);
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
  if (/lanternCardDetailModal--studioPreview/.test(html)) ok('sandbox renders studio preview modal class');
  else bad('sandbox studio class', html);
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
} else bad('computeLayout export');

console.log('\n--- studio-opened-preview-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
