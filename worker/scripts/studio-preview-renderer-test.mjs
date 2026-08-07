/**
 * Contribute Studio preview renderer parity tests (Prompt #28).
 * Proves Studio LEFT/RIGHT use production LanternCards / LanternCardUI paths.
 * Usage: node worker/scripts/studio-preview-renderer-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'app');
const contributeHtml = fs.readFileSync(path.join(app, 'contribute.html'), 'utf8');
const cardUiJs = fs.readFileSync(path.join(app, 'js/lantern-card-ui.js'), 'utf8');
const studioDraftJs = fs.readFileSync(path.join(app, 'js/lantern-studio-draft.js'), 'utf8');
const cardsJs = fs.readFileSync(path.join(app, 'js/lantern-cards.js'), 'utf8');

let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS ' + msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL ' + msg + (detail ? ' — ' + detail : ''));
}

function loadLanternStudioDraft() {
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(studioDraftJs, sandbox);
  return sandbox.LanternStudioDraft;
}

function loadCardUiMinimal() {
  const calls = [];
  const partCache = new WeakMap();
  function mkPart(name) {
    return {
      _part: name,
      innerHTML: '',
      textContent: '',
      style: {},
      appendChild() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    };
  }
  function querySelectorOn(el, sel) {
    if (!partCache.has(el)) partCache.set(el, {});
    const cache = partCache.get(el);
    if (sel === '.lanternCardDetailVisual') {
      if (!cache.visual) cache.visual = mkPart('visual');
      return cache.visual;
    }
    if (sel === '.lanternCardDetailTitle') {
      if (!cache.title) cache.title = mkPart('title');
      return cache.title;
    }
    if (sel === '.lanternCardDetailIdentityWrap') {
      if (!cache.identity) cache.identity = mkPart('identity');
      return cache.identity;
    }
    if (sel === '.lanternCardDetailMeta') {
      if (!cache.meta) cache.meta = mkPart('meta');
      return cache.meta;
    }
    if (sel === '.lanternCardDetailBody') {
      if (!cache.body) cache.body = mkPart('body');
      return cache.body;
    }
    if (sel === '.lanternCardDetailActions') {
      if (!cache.actions) cache.actions = mkPart('actions');
      return cache.actions;
    }
    if (sel === '.lanternCardDetailReactions') {
      if (!cache.reactions) cache.reactions = mkPart('reactions');
      return cache.reactions;
    }
    if (sel === '#lanternCardDetailAdminModeration') {
      if (!cache.admin) cache.admin = mkPart('admin');
      return cache.admin;
    }
    if (sel === '#lanternPollDetailChoices') {
      if (!cache.choices) cache.choices = mkPart('choices');
      return cache.choices;
    }
    return null;
  }
  const sandbox = {
    console,
    document: {
      createElement(tag) {
        const el = {
          tagName: String(tag || 'div').toUpperCase(),
          className: '',
          innerHTML: '',
          classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } },
          setAttribute() {},
          getAttribute() { return null; },
          querySelectorAll() { return []; },
          querySelector(sel) { return querySelectorOn(el, sel); },
          appendChild(c) { calls.push(['appendChild', c && c.className]); },
          parentNode: { parentNode: true },
        };
        return el;
      },
      createElementNS() { return this.createElement('div'); },
      body: { appendChild() {}, querySelectorAll() { return []; } },
    },
    LanternCards: {
      getDefaultImageUrl: () => 'https://example.com/default_poll.png',
      buildExploreAuthorAvatarHtml: () => '<span class="avatar"></span>',
      railIdentityFirstName: (n) => n,
    },
    LanternAvatar: null,
    LANTERN_AVATAR_API: '',
    window: undefined,
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cardUiJs, sandbox);
  return { UI: sandbox.LanternCardUI, calls, sandbox };
}

// --- contribute.html wiring ---
if (contributeHtml.includes('js/lantern-studio-draft.js')) ok('contribute includes lantern-studio-draft.js');
else bad('contribute missing lantern-studio-draft.js');

if (contributeHtml.includes('LanternStudioDraft.buildNewsDraft')) ok('contribute uses buildNewsDraft adapter');
else bad('contribute missing buildNewsDraft');

if (contributeHtml.includes('mountStudioPollDetail')) ok('contribute uses mountStudioPollDetail helper');
else bad('contribute missing mountStudioPollDetail');

if (contributeHtml.includes('mountPollDetailInto') || contributeHtml.includes('mountStudioPollDetail')) ok('contribute RIGHT poll uses production detail mount');
else bad('contribute poll preview not wired to production detail');

if (contributeHtml.includes('LanternCards.createStudentCard') || contributeHtml.includes('appendStudioNewsCardToRail')) ok('contribute LEFT uses LanternCards factory');
else bad('contribute LEFT missing LanternCards factory');

if (contributeHtml.includes('mountNewsDetailInto')) ok('contribute RIGHT news uses mountNewsDetailInto');
else bad('contribute RIGHT news missing mountNewsDetailInto');

if (contributeHtml.includes('mountCreationDetailInto')) ok('contribute RIGHT mission uses mountCreationDetailInto');
else bad('contribute RIGHT mission missing mountCreationDetailInto');

if (contributeHtml.includes('scheduleStudioPreviewUpdate')) ok('contribute debounced text preview updates');
else bad('contribute missing debounced preview updates');

if (!contributeHtml.includes('#studioFullPreview .newsFeatured')) ok('legacy loose-part newsFeatured CSS removed');
else bad('legacy newsFeatured CSS still present');

if (!contributeHtml.includes('pollModal lanternSurface')) ok('contribute has no inline pollModal HTML assembly');
else bad('contribute still assembles pollModal HTML inline');

// --- lantern-card-ui.js ---
if (cardUiJs.includes('function mountPollDetailInto')) ok('LanternCardUI.mountPollDetailInto exists');
else bad('mountPollDetailInto missing');

if (cardUiJs.includes('fillPollDetailFromDraft')) ok('fillPollDetailFromDraft shared poll preview renderer');
else bad('fillPollDetailFromDraft missing');

if (cardUiJs.includes('embeddedPreview && payload.draftPoll')) ok('fillPollDetailModal supports draft preview branch');
else bad('fillPollDetailModal draft branch missing');

if (!cardUiJs.includes('pollModalQuestion')) ok('static pollModal duplicate markup removed from card-ui');
else bad('static pollModal markup still in card-ui');

// --- draft adapter ---
const SD = loadLanternStudioDraft();
if (SD && typeof SD.buildNewsDraft === 'function') ok('LanternStudioDraft loads');
else bad('LanternStudioDraft failed to load');

const shoutDraft = SD.buildNewsDraft({
  contributeType: 'shoutout',
  title: '',
  body: 'Great job today!',
  shoutReason: 'kindness',
  shoutRecipient: 'Alex',
  shoutLabels: { kindness: 'Kindness' },
  authorName: 'Jamie',
  characterName: 'jamie',
  authorType: 'student',
});
if (shoutDraft.body.includes('Recognizing: Alex') && shoutDraft.body.includes('Kindness')) ok('shoutout draft composes submit-time body');
else bad('shoutout draft body', shoutDraft.body);

if (SD.isPreviewId('preview-draft') && !SD.isPreviewId('news-42')) ok('preview id detection');
else bad('preview id detection');

if (shoutDraft._previewOnly === true && !String(shoutDraft.id).match(/^\d+$/)) ok('draft adapter marks preview-only, no fake persisted id');
else bad('draft preview flags');

// --- structural renderer path: LEFT rail ---
const cardsSandbox = {
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
          const rootMatch = stub._html.match(/^<(div|a)([^>]*)>([\s\S]*)<\/\1>$/);
          const attrs = rootMatch ? rootMatch[2] : '';
          const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
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
cardsSandbox.window = cardsSandbox;
vm.createContext(cardsSandbox);
vm.runInContext(cardsJs, cardsSandbox);
const LC = cardsSandbox.LanternCards;

const studioDraft = SD.buildNewsDraft({
  contributeType: 'post',
  title: 'Studio parity headline',
  body: 'Body text for preview.',
  category: 'School News',
  authorName: 'Riley',
  characterName: 'riley',
  authorType: 'student',
  imageUrl: '',
  videoUrl: '',
  linkUrl: '',
});

const railSpec = LC.specNewsRailCard(studioDraft, LC.esc, 'Student Reporter', true);
const railNode = LC.createStudentCard(railSpec);
const railHtml = railNode && (railNode.outerHTML || railNode._html || '');
if (/lanternCanonicalCard/.test(railHtml) && /data-lantern-card-contract-version="2"/.test(railHtml)) ok('LEFT studio draft → specNewsRailCard → canonical v2 card');
else bad('LEFT rail canonical contract', railHtml.slice(0, 120));

// --- structural renderer path: RIGHT poll detail ---
const { UI } = loadCardUiMinimal();
const pollDraft = SD.buildPollDraft({
  question: 'Favorite lunch?',
  choices: ['Pizza', 'Tacos'],
  characterName: 'riley',
  authorName: 'Riley',
});
const container = { innerHTML: '', appendChild(n) { this.lastChild = n; } };
UI.mountPollDetailInto(container, pollDraft, { characterName: 'riley' });
const embedded = container.lastChild;
if (embedded && String(embedded.className).includes('lanternCardDetailModal--embedded')) ok('RIGHT poll uses embedded lanternCardDetailModal shell');
else bad('RIGHT poll shell', embedded && embedded.className);

if (embedded && embedded.innerHTML.includes('lanternCardDetailVisual')) ok('RIGHT poll detail uses production modal DOM regions');
else bad('RIGHT poll DOM regions');

console.log('\n--- studio-preview-renderer-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
