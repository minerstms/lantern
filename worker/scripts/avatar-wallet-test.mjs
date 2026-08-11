/**
 * Avatar purchase wallet authority tests — Prompt #54 / #179
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const storeJs = fs.readFileSync(path.join(root, 'app/js/lantern-store-app.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'app/js/lantern-api.js'), 'utf8');
const economyJs = fs.readFileSync(path.join(root, 'worker/economy-cosmetic.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (/lantern-wallet\.js/.test(lockerHtml)) ok('locker.html loads shared lantern-wallet.js');
else bad('locker.html missing lantern-wallet.js');

if (/avatarCropBalanceStatus/.test(lockerHtml)) ok('locker.html: avatar crop balance status element');
else bad('locker.html missing avatarCropBalanceStatus');

if (/\/api\/economy\/balance/.test(walletJs) && /cache: 'no-store'/.test(walletJs)) {
  ok('lantern-wallet.js: authoritative economy balance fetch');
} else bad('lantern-wallet.js missing economy balance fetch');

if (/AVATAR_UPLOAD_COST\s*=\s*1/.test(walletJs) && !/AVATAR_UPLOAD_COST\s*=\s*25/.test(walletJs)) {
  ok('lantern-wallet.js: avatar cost constant is 1 Nugget');
} else bad('lantern-wallet.js avatar cost must be 1');

if (/Submit avatar \(1 Nugget\)/.test(lockerHtml) && /costs <strong>1 Nugget<\/strong>/.test(lockerHtml)) {
  ok('locker.html: avatar copy uses 1 Nugget');
} else bad('locker.html still references 25 nuggets for avatar');

if (!/Submit avatar \(25/.test(lockerHtml) && !/costs <strong>25 nuggets<\/strong>/.test(lockerHtml)) {
  ok('locker.html: no leftover 25-nugget avatar product copy');
} else bad('locker.html still has 25-nugget avatar product copy');

if (/fetchMyBalance/.test(walletJs) && /\/api\/economy\/balance'/.test(walletJs)) {
  ok('lantern-wallet.js: session-scoped self balance fetch');
} else bad('lantern-wallet.js missing session-scoped fetch');

if (/fetchMyBalance/.test(storeJs) || /callGetBalance\(\)/.test(storeJs)) {
  ok('profile + store reuse session-scoped wallet helper');
} else bad('store/profile do not use session wallet helper');

if (!/locker\.wallet\.balance/.test(profileJs)) ok('profile-app: no stale locker.wallet.balance shortcut');
else bad('profile-app still uses stale locker.wallet.balance cache');

if (/refreshAvatarCropAffordability\(\)/.test(profileJs) && /callGetBalance\(\)/.test(profileJs)) {
  ok('profile-app: crop modal refreshes session wallet with loading state');
} else bad('profile-app missing crop modal session wallet refresh');

if (/avatarCropAvailable == null/.test(profileJs) && (/AvatarCropper\.isSubmitting|state\.submitting|lockerAvatarSubmitAllowed/.test(profileJs))) {
  ok('profile-app: blocks submit while loading or in flight');
} else bad('profile-app missing submit guards');

if (/syncAvatarCropSubmitState/.test(profileJs) && (/lockerAvatarSubmitAllowed|state\.imageReady/.test(profileJs))) {
  ok('profile-app: submit gated on image ready and wallet');
} else bad('profile-app missing combined submit gate');

if (/avatarCropAvailable >= cost|avatarCropAvailable >= AVATAR_UPLOAD_COST/.test(profileJs)) {
  ok('profile-app: affordability uses Available threshold');
} else bad('profile-app missing Available affordability check');

if (/refreshWalletAfterAvatarPurchase/.test(profileJs) && /invalidateLockerMe/.test(profileJs)) {
  ok('profile-app: post-purchase wallet refresh');
} else bad('profile-app missing post-purchase refresh');

if (/credentials:\s*'include'/.test(profileJs) && profileJs.includes('/api/avatar/upload')) {
  ok('profile-app: avatar upload uses session credentials');
} else bad('profile-app avatar upload missing credentials include');

if (/useHttp/.test(profileJs) && /canUseHttpEconomy/.test(profileJs) && /idempotency_key/.test(profileJs)) {
  ok('profile-app: same-origin HTTP spend + idempotency for avatar_upload');
} else bad('profile-app missing same-origin/idempotent avatar charge path');

if (/Charge authoritative TMS first|callEconomyTransact\(name, -costAmt, 'avatar_upload'/.test(profileJs)) {
  ok('profile-app: charges TMS before creating avatar submission');
} else bad('profile-app missing charge-then-upload ordering');

if (/insufficient/.test(profileJs) && /available/.test(profileJs)) {
  ok('profile-app: insufficient funds message includes available');
} else bad('profile-app missing insufficient funds formatting');

if (/You need .+ to submit an avatar/.test(profileJs)) {
  ok('profile-app: zero-balance message is clear');
} else bad('profile-app missing zero-balance copy');

if (/kind === 'avatar_upload'/.test(workerIndex) && /server_delta: -1/.test(workerIndex) && /avatar_upload costs exactly 1 Nugget/.test(workerIndex)) {
  ok('server: avatar_upload enforces exactly -1 Nugget');
} else bad('server missing avatar_upload price lock');

if (/error:\s*'insufficient'/.test(workerIndex) && /available:\s*currentBalance/.test(workerIndex)) {
  ok('server: economy transact enforces insufficient funds with available');
} else bad('server transact missing insufficient funds enforcement');

if (/error:\s*'insufficient'/.test(economyJs) && /available:/.test(economyJs)) {
  ok('server: cosmetic purchase enforces insufficient funds');
} else bad('server cosmetic missing insufficient funds enforcement');

if (!/balance:\s*req\.body/.test(economyJs) && !/client.*balance/.test(economyJs)) {
  ok('server: no client-supplied balance authority in economy-cosmetic');
} else bad('server may trust client balance');

if (/Not enough nuggets\. Need ' \+ cost/.test(apiJs) && /economyBackendCharged/.test(apiJs)) {
  ok('lantern-api: local runner still validates balance when backend not charged');
} else bad('lantern-api local avatar balance check missing');

if (/costPerSubmit \|\| 1/.test(apiJs) && !/costPerSubmit \|\| 25/.test(apiJs)) {
  ok('lantern-api: local runner default avatar cost is 1');
} else bad('lantern-api still defaults avatar cost to 25');

console.log('\n--- avatar-wallet-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
