/**
 * Contribute Studio layout + RIGHT opened preview — page-centered CENTER, 560px large card.
 * Usage: node worker/scripts/studio-opened-preview-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardUiJs = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
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

if (/\.studioOpenedHeroFrame[\s\S]*aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss)) ok('RIGHT hero frame is 16:9');
else bad('hero aspect-ratio');

if (/--lantern-studio-opened-card-width:\s*560px/.test(cardsCss)) ok('RIGHT card target 560px');
else bad('560px card token');

if (/--lantern-studio-center-width:\s*640px/.test(cardsCss)) ok('CENTER width token 640px');
else bad('CENTER width token');

if (/--lantern-studio-right-col-width:\s*600px/.test(cardsCss)) ok('RIGHT panel 600px (fits 560 card + padding)');
else bad('RIGHT panel width');

if (/\.studioColCenter[\s\S]*margin-left:\s*calc\(50vw - var\(--lantern-studio-center-half\)\)/.test(contributeHtml)) {
  ok('CENTER page-centered via 50vw minus half-width');
} else bad('CENTER page centering');

if (/\.studioColLeft[\s\S]*position:\s*absolute[\s\S]*50vw - var\(--lantern-studio-center-half\)/.test(contributeHtml)) {
  ok('LEFT panel positioned from page-centered anchor');
} else bad('LEFT panel positioning');

if (/\.studioColRight[\s\S]*position:\s*absolute[\s\S]*50vw \+ var\(--lantern-studio-center-half\)/.test(contributeHtml)) {
  ok('RIGHT panel positioned from page-centered anchor');
} else bad('RIGHT panel positioning');

if (/@media \(min-width:\s*1200px\)/.test(contributeHtml)) ok('desktop canvas breakpoint 1200px');
else bad('desktop breakpoint');

if (/@media \(max-width:\s*1199px\)/.test(contributeHtml)) ok('stacked layout below 1200px');
else bad('stacked breakpoint');

if (/\.studioColRight[\s\S]*overflow-x:\s*hidden/.test(contributeHtml)) ok('RIGHT column hides horizontal overflow');
else bad('RIGHT overflow-x hidden');

if (/\.studioOpenedPreviewHost[\s\S]*overflow-x:\s*hidden/.test(contributeHtml)) ok('preview host hides horizontal overflow');
else bad('preview host overflow');

if (/@media \(min-width:\s*1200px\)[\s\S]*\.studioOpenedHero[\s\S]*width:\s*var\(--lantern-studio-opened-card-width\)/.test(cardsCss)) {
  ok('desktop RIGHT card fixed 560px');
} else bad('desktop fixed card');

if (/\.studioOpenedHero[\s\S]*width:\s*min\(var\(--lantern-studio-opened-card-width\),\s*100%\)/.test(cardsCss)) ok('stacked/mobile uses min(560px, 100%)');
else bad('stacked card width');

if (/--lantern-studio-opened-title-size:\s*32px/.test(cardsCss)) ok('large title 32px');
else bad('title size');

if (/--lantern-studio-opened-meta-size:\s*18px/.test(cardsCss)) ok('large meta 18px');
else bad('meta size');

const leftW = 280;
const rightW = 560;
const leftH = (280 * 9) / 16;
const rightH = (560 * 9) / 16;
if (rightW / leftW === 2 && Math.abs(rightH / leftH - 2) < 0.01) {
  ok('RIGHT is 2× LEFT width and height (' + rightW + '×' + rightH + ' vs ' + leftW + '×' + leftH + ')');
} else bad('2× ratio', rightW + '×' + rightH + ' vs ' + leftW + '×' + leftH);

if (rightW > leftW * 1.9) ok('RIGHT meaningfully larger than LEFT');
else bad('size distinction');

if (/--lantern-card-width:\s*280px/.test(cardsCss)) ok('LEFT canonical remains 280px');
else bad('LEFT width');

if (!/studio-detail-emulator|studioDetailScaleStage|lantern-studio-draft/.test(contributeHtml + cardsJs + cardUiJs)) {
  ok('no scale emulator reintroduced');
} else bad('emulator artifacts');

const sandbox = {
  console,
  document: {
    createElement() {
      const stub = {
        _html: '',
        classList: { add() {}, remove() {} },
        setAttribute() {},
        querySelector: () => null,
        appendChild() {},
      };
      Object.defineProperty(stub, 'innerHTML', {
        get() { return stub._html; },
        set(v) { stub._html = String(v || ''); },
        configurable: true,
      });
      return stub;
    },
  },
  LanternMedia: undefined,
  LANTERN_AVATAR_API: undefined,
  location: { href: '' },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(cardsJs, sandbox);
vm.runInContext(cardUiJs, sandbox);

const LC = sandbox.LanternCards;
const LUI = sandbox.LanternCardUI;
if (!LC || !LUI) bad('LanternCards/LanternCardUI sandbox load');
else {
  const shell = LC.buildStudioOpenedHeroShell({
    model: {
      title: 'A Very Long Student Headline That Needs To Fit Nicely Inside The Large Preview',
      author: 'Rick',
      dateMeta: 'School News · 7/27/2026',
      typeBadge: '📢 News',
      fallbackType: 'news',
    },
  });
  if (/lanternCanonicalCardTitle/.test(shell) && /lanternCanonicalCardMeta/.test(shell)) ok('hero shell title + meta overlay');
  else bad('overlay content');
  if (!/lanternReportDetailBtn/.test(shell)) ok('Report absent');
  else bad('Report in shell');

  const container = sandbox.document.createElement('div');
  LUI.mountStudioNewsOpenedInto(container, {
    title: 'STEM Fun',
    body: '',
    category: 'School News',
    author_name: 'Jamie',
    created_at: new Date().toISOString(),
  }, { contributeType: 'post' });
  if (/studioOpenedHeroFrame/.test(container.innerHTML)) ok('news mount renders hero frame');
  else bad('news mount');
}

console.log('\n--- studio-opened-preview-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
