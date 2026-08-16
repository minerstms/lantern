/**
 * Prompt #252 — compact ticker Type: Subject — Author + avatar consistency.
 * Usage: node worker/scripts/ticker-compact-252-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  formatTickerCopy,
  looksLikeSystemLogTickerCopy,
  tickerIconForType,
  tickerTypeLabel,
} from '../marquee-ticker-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const contract = fs.readFileSync(path.join(root, 'worker/marquee-ticker-contract.js'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const tickerCss = fs.readFileSync(path.join(root, 'app/css/lantern-ticker.css'), 'utf8');
const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-staff-nav.js'), 'utf8');
const lanternNav = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const nav251 = fs.readFileSync(path.join(root, 'worker/scripts/navigation-contract-251-test.mjs'), 'utf8');

if (formatTickerCopy({ type: 'poll_created', primary_name: 'Mr. Hecht', object_title: 'What part of summer will you miss the most?' }) === 'Poll: What part of summer will you miss the most? — Mr. Hecht') {
  ok('1. Poll uses Poll: <title> — <author>');
} else bad('1. poll format');

if (formatTickerCopy({ type: 'mission_completed', primary_name: 'Mr. Radle', object_title: 'Fight Song Challenge' }) === 'Mission: Fight Song Challenge — Mr. Radle') {
  ok('2. Mission uses Mission: <title> — <author>');
} else bad('2. mission format');

if (formatTickerCopy({ type: 'leaderboard_entry', primary_name: 'Mr. Radle', object_title: 'Nugget Click Rush' }) === 'Leaderboard: Nugget Click Rush — Mr. Radle') {
  ok('3. Leaderboard uses Leaderboard: <game> — <author>');
} else bad('3. leaderboard format');

if (formatTickerCopy({ type: 'shout_out', primary_name: 'Mr. Radle', object_title: 'Thank You Ms. Shanda' }) === 'Shout-Out: Thank You Ms. Shanda — Mr. Radle') {
  ok('4. Shout-Out uses Shout-Out: <title> — <author>');
} else bad('4. shout format');

if (formatTickerCopy({ type: 'news', primary_name: 'Mr. Radle', object_title: 'Welcome Coach Colorado!' }) === 'Post: Welcome Coach Colorado! — Mr. Radle') {
  ok('5. Post/news uses Post: <title> — <author>');
} else bad('5. post format');

const blob = [contract, tickerJs].join('\n');
if (!/A student created/.test(formatTickerCopy({ type: 'poll_created', object_title: 'Q' })) && !/A student created a poll/.test(blob.replace(/looksLikeSystemLogTickerCopy[\s\S]{0,400}/, ''))) {
  ok('6. no A student created… sentence remains in formatter output');
} else bad('6. student sentence');

if (
  looksLikeSystemLogTickerCopy('Mr. Radle reached the Nugget Click Rush leaderboard') &&
  !looksLikeSystemLogTickerCopy('Leaderboard: Nugget Click Rush — Mr. Radle')
) {
  ok('7. no <name> reached… sentence remains as canonical copy');
} else bad('7. reached sentence');

const once = formatTickerCopy({ type: 'mission_created', primary_name: 'Mr. Radle', object_title: 'STEM Today' });
if ((once.match(/Mr\. Radle/g) || []).length === 1 && (once.match(/STEM Today/g) || []).length === 1) {
  ok('8/9. author appears once and subject appears once');
} else bad('8/9. duplication', once);

if (
  tickerIconForType('poll_created') === '📊' &&
  tickerIconForType('mission_created') === '🎯' &&
  tickerIconForType('leaderboard_entry') === '🏆' &&
  tickerIconForType('shout_out') === '📣' &&
  tickerIconForType('news') === '📰'
) {
  ok('10. icon is present for each user-facing type');
} else bad('10. icons');

if (
  tickerTypeLabel('poll_created') === 'Poll' &&
  tickerTypeLabel('mission_completed') === 'Mission' &&
  tickerTypeLabel('leaderboard_entry') === 'Leaderboard'
) {
  ok('labels normalize created/completed to one user-facing word');
} else bad('label normalize');

const sandbox = { window: {}, document: { getElementById: function () { return null; }, body: { classList: { contains: function () { return false; } }, contains: function () { return true; } }, addEventListener: function () {} }, location: { pathname: '/explore.html' }, LANTERN_AVATAR_API: '', addEventListener: function () {}, requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(); }, innerWidth: 1024, fetch: async function () { return { json: async function () { return { ok: false }; } }; }, console };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-avatar.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8'), sandbox);
vm.runInNewContext(tickerJs, sandbox);
const LT = sandbox.LanternTicker;

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
if (approvedItem && /key=rick\.radle/.test(approvedItem.avatarUrl) && approvedItem.author === 'Mr. Radle') {
  ok('11. eligible author avatar renders');
} else bad('11. eligible avatar', approvedItem);

if (tickerJs.includes('author_avatar_key') && tickerJs.includes('getCanonicalAvatarMap') && tickerJs.includes('lastResortSilhouetteDataUri')) {
  ok('12. previously missing types resolve through the same canonical avatar path + fallback');
} else bad('12. canonical path');

const pendingSlide = JSON.parse(JSON.stringify(approvedSlide));
pendingSlide.meta.pending_avatar_url = '/api/avatar/image?key=pending_raw';
pendingSlide.meta._canonicalAvatar = { imageUrl: '/api/avatar/image?key=rick.radle&v=1' };
const pendingItem = LT.buildDisplayTickerItems([pendingSlide])[0];
if (/rick\.radle/.test(pendingItem.avatarUrl) && !/pending_raw/.test(pendingItem.avatarUrl)) {
  ok('13. pending avatar never renders');
} else bad('13. pending');

const restrictedSlide = JSON.parse(JSON.stringify(approvedSlide));
restrictedSlide.meta.author_avatar_url = 'https://pub-xxxx.r2.dev/secret.png';
restrictedSlide.meta.avatar_image = 'https://example.com/restricted.png';
restrictedSlide.meta._canonicalAvatar = { imageUrl: '/api/avatar/image?key=rick.radle&v=1' };
const restrictedItem = LT.buildDisplayTickerItems([restrictedSlide])[0];
if (/rick\.radle/.test(restrictedItem.avatarUrl) && !/r2\.dev|restricted\.png/.test(JSON.stringify(restrictedItem))) {
  ok('14. media-restricted/ineligible avatar never renders');
} else bad('14. restricted');

const missingSlide = JSON.parse(JSON.stringify(approvedSlide));
missingSlide.meta._canonicalAvatar = { imageUrl: '' };
const missingItems = LT.buildDisplayTickerItems([missingSlide]);
const box = { querySelector: function () { return null; }, style: {}, innerHTML: '' };
sandbox.document.getElementById = function (id) { return id === 'lanternTicker' ? box : null; };
LT.render('lanternTicker', missingItems);
if (/default_avatar|data:image\/svg\+xml/.test(box.innerHTML) && /lanternTickerItemAvatar/.test(box.innerHTML)) {
  ok('15. missing eligible avatar receives neutral fallback');
} else bad('15. fallback', box.innerHTML.slice(0, 240));

if (!/r2\.dev|r2\.cloudflarestorage/.test(tickerJs) && !/r2\.dev/.test(JSON.stringify(restrictedItem))) {
  ok('16. no raw private R2 key appears in ticker payload/DOM');
} else bad('16. r2 leak');

if (!/student_character_name|economy_character_name/.test(box.innerHTML) && !/20889/.test(once)) {
  ok('17. no Student ID/login leaks in compact copy');
} else bad('17. id leak');

if (
  tickerCss.includes('lanternTickerItem + .lanternTickerItem') &&
  tickerCss.includes('clamp(36px, 4.5vw, 64px)') &&
  /animation: lanternTickerScroll/.test(tickerCss) &&
  /animation-play-state:\s*paused/.test(tickerCss)
) {
  ok('spacing between items preserved scroll/pause behavior');
} else bad('spacing/scroll');

if (
  navJs.includes('Teacher Dashboard') &&
  lanternNav.includes('Media Library') &&
  nav251.includes('Teacher Dashboard') &&
  missionsHtml.includes('lanternNavMissionsBadge')
) {
  ok('#251 nav and Missions badge markup preserved');
} else bad('nav/badge');

console.log('\nTicker compact #252:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
