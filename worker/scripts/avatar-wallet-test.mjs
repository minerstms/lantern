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

if (!/avatarCropBalanceStatus/.test(lockerHtml) && !/avatarCropSubmitBtn/.test(lockerHtml) && !/id="avatarCropOverlay"/.test(lockerHtml)) {
  ok('locker.html: student avatar crop/upload controls removed');
} else bad('locker.html still has student avatar crop/upload controls');

if (/\/api\/economy\/balance/.test(walletJs) && /cache: 'no-store'/.test(walletJs)) {
  ok('lantern-wallet.js: authoritative economy balance fetch');
} else bad('lantern-wallet.js missing economy balance fetch');

if (/AVATAR_UPLOAD_COST\s*=\s*1/.test(walletJs) && !/AVATAR_UPLOAD_COST\s*=\s*25/.test(walletJs)) {
  ok('lantern-wallet.js: avatar cost constant is 1 Nugget');
} else bad('lantern-wallet.js avatar cost must be 1');

if (!/Submit avatar \(1 Nugget\)/.test(lockerHtml) && !/Submit avatar \(25/.test(lockerHtml)) {
  ok('locker.html: no student avatar submit/cost action copy');
} else bad('locker.html still advertises student avatar submit');

if (/fetchMyBalance/.test(walletJs) && /\/api\/economy\/balance'/.test(walletJs)) {
  ok('lantern-wallet.js: session-scoped self balance fetch');
} else bad('lantern-wallet.js missing session-scoped fetch');

if (/fetchMyBalance/.test(storeJs) || /callGetBalance\(\)/.test(storeJs)) {
  ok('profile + store reuse session-scoped wallet helper');
} else bad('store/profile do not use session wallet helper');

if (!/locker\.wallet\.balance/.test(profileJs)) ok('profile-app: no stale locker.wallet.balance shortcut');
else bad('profile-app still uses stale locker.wallet.balance cache');

if (profileJs.includes("error: 'student_avatar_upload_disabled'") && !/callEconomyTransact\(name, -costAmt, 'avatar_upload'/.test(profileJs)) {
  ok('profile-app: leftover upload helper refuses without charging Nuggets');
} else bad('profile-app still charges or uploads for student avatar');

if (/kind === 'avatar_upload'/.test(workerIndex) && /resolveEconomyAmount\(db, 'avatar_upload'\)/.test(workerIndex) && /client_delta_rejected/.test(workerIndex)) {
  ok('server: avatar_upload cost is server-authoritative');
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
