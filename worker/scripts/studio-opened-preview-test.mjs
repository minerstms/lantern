/**
 * Contribute Studio RIGHT opened preview — canonical hero overlay layout.
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

if (/--lantern-studio-opened-card-width:\s*440px/.test(cardsCss)) ok('stable large-preview width token 440px');
else bad('large-preview width token');

if (/--lantern-studio-right-col-width:\s*460px/.test(cardsCss)) ok('RIGHT column width token 460px');
else bad('RIGHT column width token');

if (/--lantern-studio-center-max-width:\s*760px/.test(cardsCss)) ok('CENTER max width 760px (not 980px)');
else bad('CENTER max width');

if (/\.studioColCenter[\s\S]*max-width:\s*var\(--lantern-studio-center-max-width\)/.test(contributeHtml)) ok('CENTER uses flexible studio max-width');
else bad('CENTER studio max-width wiring');

if (!/\.studioColCenter[\s\S]*--lantern-page-max-width/.test(contributeHtml)) ok('CENTER no longer locked to 980px page max');
else bad('CENTER still uses 980px page max');

if (/\.studioColRight[\s\S]*flex:\s*0\s*0\s*var\(--lantern-studio-right-col-width\)/.test(contributeHtml)) ok('RIGHT column flex-shrink locked');
else bad('RIGHT column flex lock');

if (/\.studioColLeft[\s\S]*flex:\s*0\s*0\s*var\(--lantern-studio-left-col-width\)/.test(contributeHtml)) ok('LEFT column flex-shrink locked');
else bad('LEFT column flex lock');

if (/@media \(min-width:\s*900px\)[\s\S]*\.studioOpenedHero[\s\S]*width:\s*var\(--lantern-studio-opened-card-width\)/.test(cardsCss)) ok('desktop RIGHT card fixed at 440px (no min shrink)');
else bad('desktop fixed card width');

if (/overflow-x:\s*clip/.test(contributeHtml)) ok('Studio shell uses overflow-x clip for extreme zoom');
else bad('overflow-x clip');

if (/min-width:\s*calc\([\s\S]*--lantern-studio-left-col-width[\s\S]*--lantern-studio-right-col-width/.test(contributeHtml)) ok('three-pane row min-width protects large preview geometry');
else bad('row min-width protect');

if (/@media \(max-width:\s*899px\)/.test(contributeHtml)) ok('stacked layout breakpoint preserved at 899px');
else bad('mobile stack breakpoint');

if (/\.studioOpenedHero[\s\S]*width:\s*min\(var\(--lantern-studio-opened-card-width\),\s*100%\)/.test(cardsCss)) ok('hero uses min(target, 100%) width lock');
else bad('hero width lock');

if (/\.studioOpenedHero[\s\S]*margin-inline:\s*auto/.test(cardsCss)) ok('hero centered in pane');
else bad('hero centering');

if (/\.studioOpenedHeroFrame \.lanternCanonicalCardTitle[\s\S]*--lantern-studio-opened-title-size/.test(cardsCss)) ok('large-preview title typography scoped');
else bad('large title typography');

if (/\.studioOpenedHeroFrame \.lanternCanonicalCardTitle[\s\S]*-webkit-line-clamp:\s*2/.test(cardsCss)) ok('large-preview title two-line clamp');
else bad('large title clamp');

if (/\.studioOpenedHeroFrame \.lanternCanonicalCardMeta[\s\S]*--lantern-studio-opened-meta-size/.test(cardsCss)) ok('large-preview meta typography scoped');
else bad('large meta typography');

if (/\.studioOpenedHeroFrame \.lanternCanonicalCardOverlay[\s\S]*--lantern-studio-opened-overlay-max/.test(cardsCss)) ok('large-preview bottom overlay rhythm');
else bad('overlay rhythm');

const leftW = 280;
const leftH = Math.round((280 * 9) / 16);
const rightW = 440;
const rightH = Math.round((440 * 9) / 16);
if (rightW > leftW && rightH > leftH) ok('RIGHT target (' + rightW + '×' + rightH + ') larger than LEFT (' + leftW + '×' + leftH + ')');
else bad('RIGHT vs LEFT size');

if (/--lantern-card-width:\s*280px/.test(cardsCss) && /\.exploreCard\.lanternCanonicalCard[\s\S]*var\(--lantern-card-width\)/.test(cardsCss)) ok('LEFT canonical card remains 280px');
else bad('LEFT width unchanged');

if (!/\.exploreCard\.lanternCanonicalCard \.lanternCanonicalCardTitle/.test(cardsCss)) ok('LEFT title rule not scoped to large preview');
else bad('LEFT title accidentally overridden');

if (/font-size:\s*5vw/.test(cardsCss.match(/studioOpened[\s\S]*/)?.[0] || '')) bad('fluid vw typography in studio preview');
else ok('no aggressive vw typography on studio preview');

if (/\.lanternCanonicalCardBadgeLayer[\s\S]*top:\s*8px[\s\S]*left:\s*8px/.test(cardsCss)) ok('canonical badge layer is ULHC');
else bad('badge ULHC');

if (/\.exploreCardTypeBadge[\s\S]*right:\s*8px/.test(cardsCss)) ok('legacy exploreCardTypeBadge remains URHC (not used in studio hero)');
else bad('exploreCardTypeBadge URHC ref');

if (/\.studioOpenedHeroFrame \.exploreCardTypeBadge[\s\S]*display:\s*none/.test(cardsCss)) ok('URHC badge hidden inside studio hero');
else bad('URHC badge hidden in hero');

if (/buildStudioOpenedHeroShell/.test(cardsJs)) ok('buildStudioOpenedHeroShell compositor exists');
else bad('compositor missing');

if (/mountStudioNewsOpenedInto/.test(cardUiJs) && /mountStudioPollOpenedInto/.test(cardUiJs) && /mountStudioCreationOpenedInto/.test(cardUiJs)) {
  ok('studio mount helpers exported');
} else bad('studio mount helpers');

if (/mountStudioPollOpenedInto\(openedEl/.test(contributeHtml) && /mountStudioNewsOpenedInto\(openedEl/.test(contributeHtml)) {
  ok('contribute.html wires RIGHT preview to studio mounts');
} else bad('contribute wiring');

if (!/mountNewsDetailInto\(openedEl/.test(contributeHtml) && !/mountPollOpenedInto\(openedEl/.test(contributeHtml) && !/mountCreationDetailInto\(openedEl/.test(contributeHtml)) {
  ok('legacy detail mounts removed from openedEl');
} else bad('legacy openedEl mounts still present');

if (!/studio-detail-emulator|studioDetailScaleStage|lantern-studio-draft/.test(contributeHtml + cardsJs + cardUiJs)) {
  ok('no Prompt #29 scale emulator reintroduced');
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
      title: 'A Very Long Student Headline That Definitely Needs Truncation',
      author: 'Rick',
      dateMeta: 'School News · 7/27/2026',
      typeBadge: '📢 News',
      fallbackType: 'news',
    },
    bodyHtml: '<div class="studioOpenedBodyCaption">Body below hero.</div>',
  });
  if (/lanternCanonicalCardBadgeLayer/.test(shell) && /lanternCanonicalCardTypeBadge/.test(shell)) ok('hero shell includes ULHC badge layer');
  else bad('badge layer in shell');
  if (/lanternCanonicalCardOverlay/.test(shell) && /lanternCanonicalCardTitle/.test(shell) && /lanternCanonicalCardMeta/.test(shell)) {
    ok('title/meta inside bottom overlay');
  } else bad('overlay title/meta');
  if (!/lanternCardDetailTitle/.test(shell) && !/exploreCardTypeBadge/.test(shell)) ok('no standalone detail title or URHC badge in shell');
  else bad('standalone/URHC in shell');
  if (/studioOpenedBody/.test(shell) && /Body below hero/.test(shell)) ok('body renders below hero');
  else bad('body below hero');
  if (!/lanternReportDetailBtn/.test(shell)) ok('Report absent from hero shell');
  else bad('Report in shell');

  const container = sandbox.document.createElement('div');
  LUI.mountStudioNewsOpenedInto(container, {
    title: 'STEM Fun',
    body: '',
    category: 'School News',
    author_name: 'Jamie',
    created_at: new Date().toISOString(),
  }, { contributeType: 'post' });
  const newsHtml = container.innerHTML;
  if (/studioOpenedHeroFrame/.test(newsHtml) && !/studioOpenedBody/.test(newsHtml)) ok('empty body omits body region');
  else bad('empty body region');
  if (/lanternCanonicalCardTitle/.test(newsHtml)) ok('news mount uses canonical title class');
  else bad('news title class');

  container.innerHTML = '';
  LUI.mountStudioPollOpenedInto(container, {
    question: 'School lunch?',
    choices: ['Pizza', 'Tacos'],
    author_name: 'Alex',
    created_at: new Date().toISOString(),
  }, (s) => String(s || ''));
  const pollHtml = container.innerHTML;
  if (/pollChoiceBtn/.test(pollHtml) && /studioOpenedBody/.test(pollHtml)) ok('poll choices below hero');
  else bad('poll choices placement');
  if (!/lanternReportDetailBtn/.test(pollHtml)) ok('poll preview has no Report');
  else bad('poll Report');
}

console.log('\n--- studio-opened-preview-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
