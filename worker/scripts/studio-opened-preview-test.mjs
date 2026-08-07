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

if (/--lantern-studio-right-col-width:\s*600px/.test(cardsCss)) ok('RIGHT panel 600px');
else bad('RIGHT panel width');

if (/\.studioColCenter[\s\S]*margin-left:\s*calc\(50vw - var\(--lantern-studio-center-half\)\)/.test(contributeHtml)) {
  ok('CENTER page-centered via 50vw minus half-width');
} else bad('CENTER page centering');

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

if (/#studioOpenedPreviewInner \.lanternCardDetailModal--studioPreview/.test(cardsCss + contributeHtml)) {
  ok('Studio RIGHT modal emulator CSS');
} else bad('Studio emulator CSS');

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

console.log('\n--- studio-opened-preview-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
