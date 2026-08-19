/**
 * Prompt #239 — canonical T fallback + Avatar Match real-person eligibility.
 * Usage: node worker/scripts/avatar-fallback-239-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { selectPublicAvatarKey } from '../avatar-media-gate.js';
import { studentIdIsRestricted } from '../media-publicity.js';
import {
  buildAvatarMatchPool,
  isExcludedAvatarMatchAccount,
  isLanternSystemAvatarMatchIdentity,
} from '../avatar-match-pool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const FALLBACK = '/assets/fallback-avatar.png';
const assetPath = path.join(root, 'app/assets/fallback-avatar.png');
if (fs.existsSync(assetPath) && fs.statSync(assetPath).size > 1000) {
  ok('canonical fallback-avatar.png is a tracked static Pages asset');
} else bad('missing fallback asset', assetPath);

const avatarJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar.js'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const tickerCss = fs.readFileSync(path.join(root, 'app/css/lantern-ticker.css'), 'utf8');
const lockerJs = fs.readFileSync(path.join(root, 'app/js/lantern-locker-shell.js'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const displayHtml = fs.readFileSync(path.join(root, 'app/display.html'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const poolJs = fs.readFileSync(path.join(root, 'worker/avatar-match-pool.js'), 'utf8');

if (
  avatarJs.includes("CANONICAL_FALLBACK_AVATAR_PATH = '/assets/fallback-avatar.png'") &&
  /canonicalFallbackAvatarUrl/.test(avatarJs) &&
  cardsJs.includes('/assets/fallback-avatar.png') &&
  tickerJs.includes('/assets/fallback-avatar.png') &&
  tickerCss.includes('/assets/fallback-avatar.png')
) {
  ok('one canonical fallback path is shared by avatar/cards/ticker');
} else bad('canonical path drift');

if (!/default\/default_avatar\.png/.test(cardsJs + avatarJs + tickerJs + lockerJs + profileJs + displayHtml)) {
  ok('R2/Web Admin default_avatar is not the sitewide fallback');
} else bad('r2 default still used');

if (
  lockerJs.includes('/assets/fallback-avatar.png') &&
  profileJs.includes('/assets/fallback-avatar.png') &&
  displayHtml.includes('/assets/fallback-avatar.png') &&
  gamesHtml.includes('/assets/fallback-avatar.png')
) {
  ok('locker, profile, display, and Avatar Match UI share the T asset');
} else bad('surface path missing');

if (/el\.style\.display='none'/.test(displayHtml) && /slideAvatarImg[\s\S]{0,220}display=\\'none\\'/.test(displayHtml)) {
  bad('display still hides person avatar to a blank circle');
} else ok('H. display missing avatar stays on the T asset (does not hide the chip)');

if (!/function avatarFallbackChar/.test(gamesHtml) && /canonicalAvatarFallbackUrl/.test(gamesHtml)) {
  ok('Avatar Match game UI no longer uses initials as the person fallback');
} else bad('games initials leftover');

function makeSandbox() {
  const sandbox = {
    console,
    document: {
      getElementById: function () { return null; },
      body: { classList: { contains: function () { return false; } }, contains: function () { return true; } },
      addEventListener: function () {},
      createElement: function () {
        return { style: {}, classList: { add: function () {} }, setAttribute: function () {}, appendChild: function () {} };
      },
    },
    location: { pathname: '/explore.html' },
    LANTERN_AVATAR_API: '',
    addEventListener: function () {},
    requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(); },
    innerWidth: 1024,
    fetch: async function () { return { json: async function () { return { ok: false }; } }; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(avatarJs, sandbox);
  vm.runInNewContext(cardsJs, sandbox);
  vm.runInNewContext(tickerJs, sandbox);
  return sandbox;
}

const sandbox = makeSandbox();
const LA = sandbox.LanternAvatar;
const LC = sandbox.LanternCards;
const LT = sandbox.LanternTicker;

if (LA.canonicalFallbackAvatarUrl() === FALLBACK && LC.getDefaultAvatarImageUrl() === FALLBACK && LT.canonicalPersonFallbackUrl() === FALLBACK) {
  ok('client helpers all resolve to /assets/fallback-avatar.png');
} else bad('helper mismatch', {
  avatar: LA.canonicalFallbackAvatarUrl(),
  cards: LC.getDefaultAvatarImageUrl(),
  ticker: LT.canonicalPersonFallbackUrl(),
});

if (selectPublicAvatarKey('avatars/real.png', 'avatars/real.png', 'approved') === 'avatars/real.png') {
  ok('A. approved public avatar → real image key');
} else bad('A. approved key');

if (selectPublicAvatarKey('', '', '') === '') {
  ok('B. no avatar → no public-safe key (UI shows T, not a fake approved record)');
} else bad('B. empty key');

if (selectPublicAvatarKey('avatars/pending.png', '', 'pending') === '') {
  ok('C. pending → no public-safe key (fallback T)');
} else bad('C. pending key');

if (selectPublicAvatarKey('avatars/rejected.png', '', 'rejected') === '') {
  ok('D. rejected → no public-safe key (fallback T)');
} else bad('D. rejected key');

const restrictedSet = new Set(['20930']);
if (studentIdIsRestricted('20930', restrictedSet) === true) {
  ok('E. restricted student is not publicity-safe');
} else bad('E. restricted gate');

const approvedHtml = LC.buildExploreAuthorAvatarHtml({
  authorAvatarKey: 'approved.kid',
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=avatars/real.png' },
});
if (/avatars\/real\.png/.test(approvedHtml) && !/viewer\.png/.test(approvedHtml)) {
  ok('A-ui. Explore/chip approved avatar uses the real image');
} else bad('A-ui', approvedHtml);

const missingChip = LC.buildExploreAuthorAvatarHtml({
  authorAvatarKey: 'empty.kid',
  _canonicalAvatar: { imageUrl: '' },
});
if (missingChip.includes(FALLBACK) && !/viewer\.png|avatars\/pending/.test(missingChip)) {
  ok('G. Explore missing author avatar → fallback T');
} else bad('G. explore missing', missingChip);

const pendingChip = LC.buildExploreAuthorAvatarHtml({
  authorAvatarKey: 'pending.kid',
  _canonicalAvatar: { imageUrl: '' },
});
if (pendingChip.includes(FALLBACK)) ok('C-ui. pending Explore chip → fallback T');
else bad('C-ui pending chip', pendingChip);

const restrictedChip = LC.buildExploreAuthorAvatarHtml({
  authorAvatarKey: '20930',
  _canonicalAvatar: { imageUrl: '' },
});
if (restrictedChip.includes(FALLBACK) && !/restricted\.png/.test(restrictedChip)) {
  ok('E. restricted public Explore chip → fallback T, never private image');
} else bad('E. restricted chip', restrictedChip);

const viewerUrl = '/api/avatar/image?key=avatars/viewer.png';
const missingTickerSlide = {
  type: 'arcade_leader',
  title: 'Leaderboard: Avatar Match — Subject',
  meta: {
    marquee_type: 'leaderboard_entry',
    subject_avatar_key: 'empty.kid',
    author_avatar_key: 'empty.kid',
    public_display_name: 'Empty E.',
    object_title: 'Avatar Match',
    ticker_type_label: 'Leaderboard',
    _canonicalAvatar: { imageUrl: '' },
    viewer_avatar_url: viewerUrl,
    author_avatar_url: viewerUrl,
  },
};
const missingTickerItem = LT.buildDisplayTickerItems([missingTickerSlide])[0];
const tickerBox = { querySelector: function () { return null; }, style: {}, innerHTML: '' };
sandbox.document.getElementById = function (id) { return id === 'lanternTicker' ? tickerBox : null; };
LT.render('lanternTicker', [missingTickerItem]);
if (
  missingTickerItem &&
  !missingTickerItem.avatarUrl &&
  tickerBox.innerHTML.includes(FALLBACK) &&
  !tickerBox.innerHTML.includes('viewer.png') &&
  /lanternTickerItemAvatar/.test(tickerBox.innerHTML)
) {
  ok('F. ticker missing subject avatar → fallback T, NOT viewer avatar');
} else bad('F. ticker fallback', { item: missingTickerItem, html: tickerBox.innerHTML.slice(0, 280) });

function staffRow(username, display, extra) {
  return Object.assign({
    username,
    display_name: display,
    public_display_name: display,
    first_name: String(display).split(' ')[0],
    last_name: String(display).split(' ').slice(1).join(' ') || 'Staff',
    honorific: 'Mr.',
    role: 'teacher',
    is_active: 1,
  }, extra || {});
}
function studentRow(username, display, mtss, extra) {
  return Object.assign({
    username,
    display_name: display,
    public_display_name: display,
    first_name: String(display).split(' ')[0],
    last_name: String(display).split(' ')[1] || 'Kid',
    role: 'student',
    is_active: 1,
    mtss_student_id: mtss,
    student_character_name: mtss,
  }, extra || {});
}
function keyFn(row) {
  return String(row.role === 'student' ? (row.mtss_student_id || row.username) : row.username || '').trim();
}

const approvedStudent = studentRow('approved.kid', 'Approved Kid', '20001');
const noAvatarStudent = studentRow('empty.kid', 'Empty Kid', '20099');
const pendingStudent = studentRow('pending.kid', 'Pending Kid', '20004');
const rejectedStudent = studentRow('rejected.kid', 'Rejected Kid', '20005');
const restrictedStudent = studentRow('restricted.kid', 'Restricted Kid', '20930');
const realStaff = staffRow('rick.radle', 'Mr. Radle');
const webAdmin = staffRow('admin', 'Web Admin', { tms_staff_id: 'WebAdmin' });
const webAdminWithT = staffRow('admin', 'Web Admin', { tms_staff_id: 'WebAdmin' });
const systemOp = staffRow('operator', 'Operator');
const systemAcct = staffRow('system', 'System');
const lanternSystem = staffRow('lantern', 'Lantern');
const demo = studentRow('demo1', 'Alex Adventure', '20111');
const testAcc = studentRow('test_e2e', 'Test Kid', '20112');

const avatarByChar = {
  20001: 'avatars/real.png',
  'rick.radle': 'avatars/staff.png',
  admin: 'avatars/admin-t.png',
  operator: 'avatars/op.png',
  system: 'avatars/sys.png',
  lantern: 'avatars/lantern.png',
  20111: 'avatars/demo.png',
  20112: 'avatars/test.png',
  20930: 'avatars/restricted.png',
};

const accounts = [
  approvedStudent, noAvatarStudent, pendingStudent, rejectedStudent, restrictedStudent,
  realStaff, webAdmin, webAdminWithT, systemOp, systemAcct, lanternSystem, demo, testAcc,
];
const pool = buildAvatarMatchPool(accounts, avatarByChar, 'https://lantern.example', keyFn, {
  restrictedSet,
});
const names = pool.map((c) => c.display_name);

if (!names.includes('Empty Kid') && !names.includes('Pending Kid') && !names.includes('Rejected Kid')) {
  ok('I. fallback-only / pending / rejected people are excluded from Avatar Match');
} else bad('I. fallback-only leaked', names);

if (names.includes('Approved Kid') && pool.some((c) => /real\.png/.test(c.avatar_url))) {
  ok('J. real student with approved avatar is included');
} else bad('J. student missing', pool);

if (names.includes('Mr. Radle') && pool.some((c) => /staff\.png/.test(c.avatar_url))) {
  ok('K. real staff with approved avatar is included');
} else bad('K. staff missing', pool);

if (
  isLanternSystemAvatarMatchIdentity(webAdmin) &&
  isExcludedAvatarMatchAccount(webAdminWithT) &&
  !names.includes('Web Admin') &&
  !pool.some((c) => /admin-t\.png/.test(c.avatar_url || ''))
) {
  ok('L. Web Admin excluded even with an uploaded avatar');
} else bad('L. web admin leaked', pool);

if (
  isExcludedAvatarMatchAccount(systemOp) &&
  isExcludedAvatarMatchAccount(systemAcct) &&
  isExcludedAvatarMatchAccount(lanternSystem) &&
  !names.includes('Operator') &&
  !names.includes('System') &&
  !names.includes('Lantern')
) {
  ok('M. system/operator/Lantern system identities excluded');
} else bad('M. system leaked', names);

if (isExcludedAvatarMatchAccount(demo) && isExcludedAvatarMatchAccount(testAcc) && !names.includes('Alex Adventure') && !names.includes('Test Kid')) {
  ok('N. test/demo identities excluded');
} else bad('N. test/demo leaked', names);

const visiblePeople = 60;
const fallbackOnlyCount = 12;
const expectedEligible = visiblePeople - fallbackOnlyCount;
const syntheticVisible = [];
const syntheticMap = {};
for (let i = 0; i < visiblePeople; i++) {
  const sid = String(30000 + i);
  const row = studentRow('kid.' + i, 'Kid ' + i, sid);
  syntheticVisible.push(row);
  if (i < expectedEligible) syntheticMap[sid] = 'avatars/k' + i + '.png';
}
const eligiblePool = buildAvatarMatchPool(syntheticVisible, syntheticMap, 'https://lantern.example', keyFn);
if (eligiblePool.length === expectedEligible) {
  ok('O. Avatar Match eligible count equals the filtered question pool (48 of 60)');
} else bad('O. count != pool', { eligible: eligiblePool.length, expected: expectedEligible });

if (
  /isLanternSystemAvatarMatchIdentity/.test(poolJs) &&
  /username === 'admin'|SYSTEM_AVATAR_MATCH_USERNAMES/.test(poolJs) &&
  !/createHash|pixel|perceptual|phash/.test(poolJs)
) {
  ok('Avatar Match excludes system identities by durable identity, not pixel comparison');
} else bad('identity rule / hashing');

if (!isExcludedAvatarMatchAccount(realStaff) && !isLanternSystemAvatarMatchIdentity(realStaff)) {
  ok('ordinary real staff remain eligible');
} else bad('staff over-excluded');

console.log('\n--- avatar-fallback-239-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
