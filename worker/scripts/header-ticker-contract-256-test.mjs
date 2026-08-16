/**
 * Prompt #256 — canonical Lantern header + activity ticker contract.
 * Usage: node worker/scripts/header-ticker-contract-256-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { formatTickerCopy, tickerIconForType, tickerTypeLabel } from '../marquee-ticker-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const contract = read('docs/LANTERN_HEADER_CONTRACT.md');
const tickerJs = read('app/js/lantern-ticker.js');
const tickerCss = read('app/css/lantern-ticker.css');
const headerCss = read('app/css/lantern-header.css');
const navJs = read('app/js/lantern-nav.js');
const staffNav = read('app/js/lantern-staff-nav.js');
const navContract = read('docs/NAVIGATION_CONTRACT.md');
const nav251 = read('worker/scripts/navigation-contract-251-test.mjs');
const tools253 = read('worker/scripts/teacher-tools-253-test.mjs');
const tools255 = read('worker/scripts/teacher-tools-255-test.mjs');
const exploreHtml = read('app/explore.html');
const missionsHtml = read('app/missions.html');

if (
  contract.includes('Two distinct header rows') &&
  contract.includes('canonical item component') &&
  contract.includes('Spacing is CSS, not strings') &&
  contract.includes('Avatar slot is required') &&
  contract.includes('MUST preserve this contract')
) {
  ok('1. canonical contract document exists');
} else bad('1. contract document');

if (
  tickerJs.includes('lanternTickerItemIcon') &&
  tickerJs.includes('lanternTickerAvatar') &&
  tickerJs.includes('lanternTickerItemCopy') &&
  tickerJs.includes('lanternTickerItemType') &&
  tickerJs.includes('lanternTickerItemColon') &&
  tickerJs.includes('lanternTickerItemSubject') &&
  tickerJs.includes('lanternTickerItemDash') &&
  tickerJs.includes('lanternTickerItemAuthor')
) {
  ok('2. ticker item uses structural children');
} else bad('2. structural children');

const askedKeys = [];
const sandbox = {
  window: {},
  document: {
    getElementById: function () { return null; },
    body: { classList: { contains: function () { return false; } }, contains: function () { return true; } },
    addEventListener: function () {},
  },
  location: { pathname: '/explore.html' },
  LANTERN_AVATAR_API: '',
  addEventListener: function () {},
  requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(); },
  innerWidth: 1024,
  fetch: async function () { return { json: async function () { return { ok: false }; } }; },
  console,
};
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(read('app/js/lantern-avatar.js'), sandbox);
const realMap = sandbox.LanternAvatar.getCanonicalAvatarMap;
sandbox.LanternAvatar.getCanonicalAvatarMap = function (items) {
  (items || []).forEach(function (it) { askedKeys.push(String((it && it.characterName) || '')); });
  return realMap.call(sandbox.LanternAvatar, items);
};
vm.runInNewContext(read('app/js/lantern-cards.js'), sandbox);
vm.runInNewContext(tickerJs, sandbox);
const LT = sandbox.LanternTicker;
const LTC = sandbox.LanternTickerContract;

function renderToBox(items) {
  const box = { querySelector: function () { return null; }, style: {}, innerHTML: '' };
  sandbox.document.getElementById = function (id) { return id === 'lanternTicker' ? box : null; };
  LT.render('lanternTicker', items);
  return box.innerHTML;
}

const approvedSlide = {
  type: 'featured_creation',
  title: 'Mission: STEM Today — Mr. Radle',
  subtitle: '',
  meta: {
    marquee_type: 'mission_created',
    public_display_name: 'Mr. Radle',
    author_avatar_key: 'rick.radle',
    ticker_icon: '🎯',
    ticker_type_label: 'Mission',
    object_title: 'STEM Today',
    destination: 'missions.html',
    _canonicalAvatar: { imageUrl: '/api/avatar/image?key=rick.radle&v=1' },
  },
};
const approvedItem = LT.buildDisplayTickerItems([approvedSlide])[0];
const approvedHtml = LT.itemToHtml(approvedItem);

if (/lanternTickerItemIcon/.test(approvedHtml)) ok('3. icon slot exists');
else bad('3. icon slot', approvedHtml.slice(0, 180));

if (/lanternTickerAvatar/.test(approvedHtml) && /lanternTickerItemAvatar/.test(approvedHtml)) ok('4. avatar slot exists');
else bad('4. avatar slot', approvedHtml.slice(0, 180));

if (/lanternTickerItemCopy/.test(approvedHtml)) ok('5. copy slot exists');
else bad('5. copy slot', approvedHtml.slice(0, 180));

if (
  /display:\s*(inline-)?flex/.test(tickerCss) &&
  /align-items:\s*center/.test(tickerCss) &&
  tickerCss.includes('--lantern-ticker-item-gap') &&
  tickerCss.includes('--lantern-ticker-copy-gap') &&
  /\.lanternTickerItem\{[\s\S]*gap:\s*8px/.test(tickerCss)
) {
  ok('6. spacing uses CSS gap/layout');
} else bad('6. css gap');

if (!/&nbsp;/.test(tickerJs) && !/&nbsp;/.test(tickerCss) && !/\\u00a0/.test(tickerJs)) {
  ok('7. no &nbsp; spacing hacks');
} else bad('7. nbsp');

if (
  tickerJs.includes("parts.join('')") &&
  !/typeHtml \+ \(subjectHtml \? ' ' : ''\)/.test(tickerJs) &&
  !/lanternTickerItemSep"> — </.test(tickerJs)
) {
  ok('8. no literal-space-dependent item construction');
} else bad('8. literal spaces');

if (
  /white-space:\s*nowrap/.test(tickerCss) &&
  tickerJs.includes('normalizeTickerWhitespace') &&
  LTC.normalizeTickerWhitespace('Fight\nSong\n  Challenge') === 'Fight Song Challenge'
) {
  ok('9. ticker item is nowrap and whitespace is normalized');
} else bad('9. nowrap/normalize');

if (
  tickerCss.includes('--lantern-ticker-avatar-size') &&
  tickerCss.includes('border-radius: 50%') &&
  tickerCss.includes('object-fit: cover') &&
  tickerCss.includes('flex: 0 0 var(--lantern-ticker-avatar-size)')
) {
  ok('10. avatar geometry fixed');
} else bad('10. avatar geometry');

if (
  tickerCss.includes('.lanternTickerAvatar{') &&
  tickerCss.includes('.lanternTickerItemAvatar{') &&
  tickerCss.includes('var(--lantern-ticker-avatar-size)') &&
  !/img\.lanternTickerItemAvatar\[src=""\]/.test(tickerCss)
) {
  ok('11. fallback geometry matches real avatar and empty src is not hidden');
} else bad('11. fallback geometry');

if (
  tickerCss.includes('--lantern-ticker-item-gap') &&
  tickerCss.includes('.lanternTickerItem + .lanternTickerItem::before') &&
  tickerCss.includes('.lanternTickerCopy + .lanternTickerCopy::before') &&
  /gap:\s*var\(--lantern-ticker-item-gap\)/.test(tickerCss)
) {
  ok('12. item-to-item separator/gap exists including clone boundary');
} else bad('12. item separator');

if (approvedItem && /key=rick\.radle/.test(approvedItem.avatarUrl) && /key=rick\.radle/.test(approvedHtml)) {
  ok('13. approved eligible author avatar renders');
} else bad('13. eligible avatar', approvedItem);

const missingSlide = JSON.parse(JSON.stringify(approvedSlide));
missingSlide.meta._canonicalAvatar = { imageUrl: '' };
const missingItem = LT.buildDisplayTickerItems([missingSlide])[0];
const missingHtml = LT.itemToHtml(missingItem);
if (/data:image\/svg\+xml/.test(missingHtml) && /lanternTickerAvatar/.test(missingHtml) && !/key=rick\.radle/.test(missingHtml)) {
  ok('14. missing avatar renders silhouette');
} else bad('14. silhouette', missingHtml.slice(0, 280));

const nameOnlySlide = {
  type: 'featured_creation',
  title: 'Mission: Fight Song Challenge — Mr. Radle',
  subtitle: '',
  meta: {
    marquee_type: 'mission_created',
    public_display_name: 'Mr. Radle',
    author_avatar_key: '',
    ticker_icon: '🎯',
    ticker_type_label: 'Mission',
    object_title: 'Fight Song Challenge',
  },
};
askedKeys.length = 0;
const nameOnlyItem = LT.buildDisplayTickerItems([nameOnlySlide])[0];
const nameOnlyHtml = LT.itemToHtml(nameOnlyItem);
if (
  !nameOnlyItem.avatarUrl &&
  /data:image\/svg\+xml/.test(nameOnlyHtml) &&
  !askedKeys.includes('Mr. Radle') &&
  !askedKeys.includes('rick.radle') &&
  !/key=rick\.radle/.test(nameOnlyHtml)
) {
  ok('15. author with only display-name snapshot renders silhouette, not guessed avatar');
} else bad('15. display-name guess', { askedKeys, avatarUrl: nameOnlyItem.avatarUrl, html: nameOnlyHtml.slice(0, 220) });

const pendingSlide = JSON.parse(JSON.stringify(approvedSlide));
pendingSlide.meta.pending_avatar_url = '/api/avatar/image?key=pending_raw';
pendingSlide.meta._canonicalAvatar = { imageUrl: '/api/avatar/image?key=rick.radle&v=1' };
const pendingItem = LT.buildDisplayTickerItems([pendingSlide])[0];
if (/rick\.radle/.test(pendingItem.avatarUrl) && !/pending_raw/.test(pendingItem.avatarUrl) && !/pending_raw/.test(LT.itemToHtml(pendingItem))) {
  ok('16. pending avatar never renders');
} else bad('16. pending');

const rejectedSlide = JSON.parse(JSON.stringify(approvedSlide));
rejectedSlide.meta.rejected_avatar_url = '/api/avatar/image?key=rejected_raw';
rejectedSlide.meta.author_avatar_url = '/api/avatar/image?key=rejected_raw';
rejectedSlide.meta._canonicalAvatar = { imageUrl: '/api/avatar/image?key=rick.radle&v=1' };
const rejectedItem = LT.buildDisplayTickerItems([rejectedSlide])[0];
if (/rick\.radle/.test(rejectedItem.avatarUrl) && !/rejected_raw/.test(JSON.stringify(rejectedItem)) && !/rejected_raw/.test(LT.itemToHtml(rejectedItem))) {
  ok('17. rejected avatar never renders');
} else bad('17. rejected');

const restrictedSlide = JSON.parse(JSON.stringify(approvedSlide));
restrictedSlide.meta.author_avatar_url = 'https://pub-xxxx.r2.dev/secret.png';
restrictedSlide.meta.avatar_image = 'https://example.com/restricted.png';
restrictedSlide.meta._canonicalAvatar = { imageUrl: '/api/avatar/image?key=rick.radle&v=1' };
const restrictedItem = LT.buildDisplayTickerItems([restrictedSlide])[0];
if (/rick\.radle/.test(restrictedItem.avatarUrl) && !/r2\.dev|restricted\.png/.test(JSON.stringify(restrictedItem)) && !/r2\.dev|restricted\.png/.test(LT.itemToHtml(restrictedItem))) {
  ok('18. restricted avatar never renders');
} else bad('18. restricted');

const systemHtml = LT.itemToHtml(LT.FALLBACK_TICKER_ITEM);
const rendered = renderToBox([approvedItem, missingItem, LT.FALLBACK_TICKER_ITEM]);
const avatarSlots = rendered.match(/lanternTickerAvatar/g) || [];
if (
  /lanternTickerAvatar/.test(systemHtml) &&
  /data:image\/svg\+xml/.test(systemHtml) &&
  avatarSlots.length === 6 &&
  !/el\.style\.display='none'/.test(tickerJs) &&
  !/display:\s*none/.test(tickerCss.match(/lanternTickerItemAvatar[\s\S]{0,400}/)[0] || '')
) {
  ok('19. no blank avatar state exists');
} else bad('19. blank avatar', { system: systemHtml.slice(0, 160), slots: avatarSlots.length });

if (
  /src="/.test(approvedHtml) &&
  /src="/.test(missingHtml) &&
  /src="/.test(systemHtml) &&
  !/src=""/.test(approvedHtml) &&
  !/src=""/.test(missingHtml) &&
  !/src=""/.test(systemHtml) &&
  !/src=""/.test(rendered)
) {
  ok('20. no broken empty src state exists');
} else bad('20. empty src');

const copies = rendered.match(/data-ticker-copy="/g) || [];
const cloneBlock = rendered.split('data-ticker-copy="clone"')[1] || '';
if (copies.length === 2 && (cloneBlock.match(/lanternTickerAvatar/g) || []).length === 3 && /aria-hidden="true"/.test(rendered)) {
  ok('21. every cloned ticker copy contains avatar markup');
} else bad('21. clone avatars', { copies: copies.length, cloneAvatars: (cloneBlock.match(/lanternTickerAvatar/g) || []).length });

const hydrateRoot = { innerHTML: rendered, querySelectorAll: function (sel) {
  if (sel === '[data-ticker-avatar-key]') {
    const keys = [];
    rendered.replace(/data-ticker-avatar-key="([^"]+)"/g, function (_, k) { keys.push(k); return _; });
    return keys.map(function (k) {
      const img = { src: '/api/avatar/image?key=rick.radle&v=1' };
      return {
        getAttribute: function (n) { return n === 'data-ticker-avatar-key' ? k : ''; },
        querySelector: function () { return img; },
        _img: img,
      };
    });
  }
  return [];
} };
const hydrated = [];
hydrateRoot.querySelectorAll = function (sel) {
  if (sel !== '[data-ticker-avatar-key]') return [];
  const nodes = [];
  rendered.replace(/data-ticker-avatar-key="([^"]+)"/g, function (_, k) {
    const img = { src: '/old.png' };
    const node = {
      getAttribute: function (n) { return n === 'data-ticker-avatar-key' ? k : ''; },
      querySelector: function () { return img; },
    };
    node._img = img;
    hydrated.push(img);
    nodes.push(node);
    return _;
  });
  return nodes;
};
const updated = LT.applyResolvedAvatarToAllCopies(hydrateRoot, 'rick.radle', '/api/avatar/image?key=rick.radle&v=2');
if (updated >= 2 && updated === hydrated.length && hydrated.every(function (img) { return img.src.indexOf('v=2') !== -1; })) {
  ok('22. async hydration updates every copy');
} else bad('22. hydration', { updated, srcs: hydrated.map(function (i) { return i.src; }) });

if (
  !/id="[^"]*ticker[^"]*avatar/i.test(tickerJs) &&
  !/id="[^"]*Avatar/.test(approvedHtml) &&
  !/\sid="/.test(approvedHtml) &&
  tickerJs.includes('querySelectorAll') &&
  tickerJs.includes('data-ticker-avatar-key')
) {
  ok('23. no duplicate DOM id is used for per-event avatars');
} else bad('23. duplicate ids');

const typeCases = [
  ['poll_created', 'poll', 'Poll', 'What is your favorite sport?', 'Mr. Begano', '📊'],
  ['mission_created', 'featured_creation', 'Mission', 'Fight Song Challenge', 'Mr. Radle', '🎯'],
  ['leaderboard_entry', 'arcade_leader', 'Leaderboard', 'Nugget Click Rush', 'Mr. Radle', '🏆'],
  ['shout_out', 'student_news', 'Shout-Out', 'Welcome Coach Colorado!', 'Mr. Radle', '📣'],
  ['news', 'student_news', 'Post', 'Hallway Highlights', 'Mr. Radle', '📰'],
  ['news_photo', 'student_news', 'Photo', 'Game Night', 'Mr. Radle', '📸'],
  ['news_good_news', 'student_news', 'Good News', 'We won!', 'Mr. Radle', '⭐'],
];
let copyOk = true;
typeCases.forEach(function (row) {
  const expected = row[2] + ': ' + row[3] + ' — ' + row[4];
  const formatted = formatTickerCopy({ type: row[0], primary_name: row[4], object_title: row[3] });
  const item = LT.buildDisplayTickerItems([{
    type: row[1],
    title: expected,
    meta: {
      marquee_type: row[0],
      ticker_type_label: row[2],
      ticker_icon: row[5],
      object_title: row[3] + '\n',
      public_display_name: row[4],
    },
  }])[0];
  const html = LT.itemToHtml(item);
  const sentence = /created|reached|posted by|completed by|got a shout-out from|A student created/i.test(html);
  if (
    formatted !== expected ||
    item.typeLabel !== row[2] ||
    item.subject !== row[3] ||
    item.author !== row[4] ||
    item.icon !== row[5] ||
    html.indexOf('lanternTickerItemType') === -1 ||
    html.indexOf(row[3]) === -1 ||
    sentence
  ) {
    copyOk = false;
    bad('copy ' + row[2], { formatted, item, html: html.slice(0, 220) });
  }
});
if (copyOk) ok('copy contract: Poll/Mission/Leaderboard/Shout-Out/Post/Photo/Good News');

if (
  tickerTypeLabel('recognition') === 'Shout-Out' &&
  tickerIconForType('recognition') === '📣' &&
  !looksLikeSentence(tickerJs)
) {
  ok('recognition normalizes to Shout-Out and narrative sentences stay detector-only');
} else bad('recognition/narrative');

function looksLikeSentence(src) {
  const withoutDetector = src.replace(/looksLikeSystemLogTickerCopy[\s\S]{0,500}/, '');
  return /A student created a poll/.test(withoutDetector) || /reached the .* leaderboard/.test(withoutDetector);
}

if (
  navJs.includes('>Small Town<') &&
  navJs.includes('>Big Pride<') &&
  navJs.includes('lanternAppBarHomeLink') &&
  navJs.includes('applySignedInHeaderIdentity') &&
  navJs.includes('Search Lantern') &&
  exploreHtml.includes('id="lanternTicker"') &&
  exploreHtml.includes('id="lanternAppBarRoot"') &&
  exploreHtml.includes('lantern-nav.js') &&
  exploreHtml.includes('lantern-ticker.js')
) {
  ok('app-bar shell preserved: Small Town, Big Pride, dropdown, signed-in name, Search, one shared renderer');
} else bad('app-bar shell');

if (
  !staffNav.includes("'Teacher Dashboard'") &&
  !navJs.includes('Teacher Dashboard') &&
  navContract.includes('There is no separate canonical Teacher Dashboard product') &&
  nav251.includes('Teacher Dashboard is absent') &&
  tools253.includes('Teacher Dashboard') &&
  tools255.includes('Media Library Access') &&
  navJs.includes('Media Library') &&
  missionsHtml.includes('lanternNavMissionsBadge') &&
  headerCss.includes('LANTERN_HEADER_CONTRACT.md')
) {
  ok('nav capability contract preserved; Teacher Dashboard not reintroduced; Media Library kept');
} else bad('nav capability regression');

console.log('\nHeader/ticker contract #256:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
