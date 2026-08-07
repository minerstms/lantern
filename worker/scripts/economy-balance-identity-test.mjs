/**
 * Economy balance identity tests — Prompt #56
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveEconomyBalanceRead, resolveEconomyGamePlayTransact, pilotSelfEconomyKey } from '../economy-balance-auth.js';

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

const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const storeJs = fs.readFileSync(path.join(root, 'app/js/lantern-store-app.js'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

const lucasAccount = {
  username: '20889',
  role: 'student',
  display_name: 'Lucas',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
};
const pilotEconomyCharacterName = (row) => {
  const mid = row.mtss_student_id != null ? String(row.mtss_student_id).trim() : '';
  if (mid) return mid;
  const scn = row.student_character_name != null ? String(row.student_character_name).trim() : '';
  if (scn) return scn;
  return String(row.username || '').trim();
};

if (/fetchMyBalance/.test(walletJs) && /\/api\/economy\/balance'/.test(walletJs)) {
  ok('lantern-wallet.js: session-scoped self balance fetch');
} else bad('lantern-wallet.js missing session-scoped fetch');

if (/fetchMyBalance/.test(storeJs) && /callGetBalance\(\)/.test(storeJs)) {
  ok('store JS: self wallet uses session balance');
} else bad('store JS missing session balance call');

if (/refreshAvatarCropAffordability\(\)/.test(profileJs) && /callGetBalance\(\)/.test(profileJs)) {
  ok('profile-app: avatar crop uses session balance');
} else bad('profile-app avatar crop missing session balance');

if (!/refreshAvatarCropAffordability\(adopted/.test(profileJs) && !/refreshAvatarCropAffordability\(String\(adopted/.test(profileJs)) {
  ok('profile-app: avatar crop does not pass client display identity');
} else bad('profile-app still passes client identity to crop refresh');

if (/Could not check balance/.test(profileJs)) ok('profile-app: truthful balance failure message');
else bad('profile-app missing balance failure message');

if (/resolveEconomyBalanceRead/.test(workerIndex)) ok('worker: balance read uses session resolver');
else bad('worker missing resolveEconomyBalanceRead');

const balanceRouteBlock = workerIndex.match(
  /request\.method === 'GET' && path === '\/api\/economy\/balance'[\s\S]{0,1200}/
);
if (balanceRouteBlock && !/Missing character_name/.test(balanceRouteBlock[0])) {
  ok('worker: self wallet no longer requires client character_name');
} else bad('worker balance route still requires client character_name');

const selfRead = resolveEconomyBalanceRead(lucasAccount, '', pilotEconomyCharacterName);
if (selfRead.ok && selfRead.characterName === '20889' && selfRead.session_scoped) {
  ok('Lucas-shaped account: session self wallet resolves to 20889');
} else bad('Lucas session wallet key', selfRead);

const displayParamRead = resolveEconomyBalanceRead(lucasAccount, 'Lucas', pilotEconomyCharacterName);
if (!displayParamRead.ok && displayParamRead.error === 'forbidden') {
  ok('display name Lucas cannot read wallet when economy key is 20889');
} else bad('display name param should be forbidden', displayParamRead);

const ownKeyRead = resolveEconomyBalanceRead(lucasAccount, '20889', pilotEconomyCharacterName);
if (ownKeyRead.ok && ownKeyRead.characterName === '20889') ok('student may read own economy key explicitly');
else bad('student own key read', ownKeyRead);

const otherStudent = resolveEconomyBalanceRead(lucasAccount, '99999', pilotEconomyCharacterName);
if (!otherStudent.ok && otherStudent.error === 'forbidden') ok('student cannot read another wallet by param');
else bad('cross-student read blocked', otherStudent);

const unauth = resolveEconomyBalanceRead(null, '', pilotEconomyCharacterName);
if (!unauth.ok && unauth.error === 'not_authenticated') ok('unauthenticated self-wallet rejected');
else bad('unauthenticated rejected', unauth);

const teacher = resolveEconomyBalanceRead(
  { username: 'teacher1', role: 'teacher', teacher_id: 'teacher1' },
  '20889',
  pilotEconomyCharacterName
);
if (teacher.ok && teacher.characterName === '20889') ok('teacher may query selected student wallet');
else bad('teacher selected student read', teacher);

if (pilotSelfEconomyKey(lucasAccount, pilotEconomyCharacterName) === '20889') {
  ok('pilotSelfEconomyKey prefers MTSS/economy id over display student_character_name');
} else bad('pilotSelfEconomyKey mismatch');

const gamePlay = resolveEconomyGamePlayTransact(lucasAccount, 'Lucas', pilotEconomyCharacterName);
if (gamePlay.ok && gamePlay.characterName === '20889') ok('game_play transact session wallet is 20889 not Lucas');
else bad('game_play transact identity', gamePlay);

if (/id\.economy_key/.test(profileJs)) ok('profile getAdopted fallback prefers economy_key');
else bad('profile getAdopted missing economy_key preference');

if (/avatarCropImageReady/.test(profileJs) && /syncAvatarCropSubmitState/.test(profileJs)) {
  ok('regression: Prompt #55 crop lifecycle preserved');
} else bad('regression: crop lifecycle missing');

console.log('\n--- economy-balance-identity-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
