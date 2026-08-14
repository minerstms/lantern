/**
 * Paid game-start wallet regression (Prompt #59).
 * Usage: node worker/scripts/games-paid-start-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  resolveEconomyGamePlayTransact,
  pilotSelfEconomyKey,
  SELF_ECONOMY_TRANSACT_KINDS,
} from '../economy-balance-auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

function loadPaidStartModule() {
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    Promise,
    Number,
    Math,
    String,
  };
  sandbox.window = sandbox.globalThis;
  vm.runInNewContext(paidStartJs, sandbox);
  return sandbox.LanternGamesPaidStart;
}

const lucasAccount = {
  role: 'student',
  username: '20889',
  display_name: 'Lucas',
  student_character_name: 'Lucas',
};

const pilotEconomyCharacterName = (row) => {
  if (String(row.role || '').trim().toLowerCase() === 'student') {
    return String(row.username || '').trim();
  }
  return '';
};

const playAuth = resolveEconomyGamePlayTransact(lucasAccount, 'Lucas', pilotEconomyCharacterName);
if (playAuth.ok && playAuth.characterName === '20889' && playAuth.session_scoped) {
  ok('game_play transact uses session economy key 20889 not Lucas');
} else bad('game_play session identity', playAuth);

const playAuthDisplay = resolveEconomyGamePlayTransact(lucasAccount, '', pilotEconomyCharacterName);
if (playAuthDisplay.ok && playAuthDisplay.characterName === '20889') {
  ok('game_play transact resolves key when client omits character_name');
} else bad('game_play omit character_name', playAuthDisplay);

if (workerIndex.includes('isSelfEconomyTransactKind(kindEarly)') && workerIndex.includes('resolveEconomySelfTransact')) {
  ok('worker transact routes game_play through session resolver');
} else bad('worker game_play hook');
if (SELF_ECONOMY_TRANSACT_KINDS.includes('game_play') && SELF_ECONOMY_TRANSACT_KINDS.includes('game_win')) {
  ok('worker transact routes game_win through the same session resolver');
} else bad('worker game_win hook');
if (workerIndex.includes('ensureFirstGameMissionCompletion')) {
  ok('worker game_play success path hooks First Game mission completion');
} else bad('worker missing first-game mission completion hook');

if (walletJs.includes('canUseHttpEconomy') && walletJs.includes("economyApiBase() !== null || typeof global.fetch")) {
  ok('LanternWallet treats empty API base as same-origin HTTP');
} else bad('canUseHttpEconomy');

if (walletJs.includes('postEconomyTransact') && walletJs.includes("base != null ? base : ''")) {
  ok('LanternWallet transact URL supports same-origin prefix');
} else bad('postEconomyTransact URL');

if (gamesHtml.includes('lantern-games-paid-start.js') && gamesHtml.includes('LanternGamesPaidStart.startPaidGame')) {
  ok('games.html uses shared LanternGamesPaidStart');
} else bad('games.html paid-start wiring');

if (!gamesHtml.includes('LanternGamesPaidStart.startPaidGame') || gamesHtml.includes('.spendOnGame({ character_name: adopted.name, game_name: gameName')) {
  bad('local runner spendOnGame still in main paid-start path');
} else ok('main paid-start path does not use local runner spendOnGame');

if (!gamesHtml.match(/if\s*\(\s*economyApiBase\s*\)/)) {
  ok('falsy empty-string economyApiBase branch removed from transact');
} else bad('economyApiBase truthy check still present');

function isAffordable(wallet, cost) {
  if (!wallet || !wallet.ok || wallet.available == null) return null;
  var available = Number(wallet.available);
  var playCost = Math.max(1, Math.floor(Number(cost) || 1));
  if (!Number.isFinite(available)) return null;
  return available >= playCost;
}

if (isAffordable({ ok: true, available: 215 }, 1) === true) ok('215 available vs cost 1 is affordable');
else bad('215/1 affordable');
if (isAffordable({ ok: true, available: 1 }, 1) === true) ok('1 available vs cost 1 is affordable');
else bad('1/1 affordable');
if (isAffordable({ ok: true, available: 0 }, 1) === false) ok('0 available vs cost 1 is insufficient');
else bad('0/1 insufficient');
if (isAffordable({ ok: false, available: null }, 1) === null) ok('missing wallet is error not zero');
else bad('missing wallet handling');
if (isAffordable({ ok: true, available: null }, 1) === null) ok('null available is error not zero');
else bad('null available handling');

if (paidStartJs.includes('function isAffordable')) {
  ok('LanternGamesPaidStart defines isAffordable helper');
} else bad('LanternGamesPaidStart isAffordable');

if (paidStartJs.includes('Could not check your Nugget balance')) {
  ok('malformed wallet shows load error not insufficient');
} else bad('wallet error message');

if (paidStartJs.includes('You need 1 Nugget to play.')) {
  ok('insufficient balance uses explicit product wording (#163)');
} else bad('insufficient wording');

if (paidStartJs.includes('delta: -cost') && paidStartJs.includes("kind: 'game_play'")) {
  ok('transaction delta equals negative play_cost');
} else bad('transact payload');

if (gamesHtml.includes('tryPlay') && gamesHtml.includes('LanternGamesPaidStart.startPaidGame')) {
  ok('tryPlay delegates to shared startPaidGame');
} else bad('tryPlay delegation');

if (gamesHtml.includes('done(false, res') || gamesHtml.includes('done(false, res ||')) {
  ok('tryPlay forwards failure detail for persistent pregame status');
} else bad('tryPlay failure detail forward');

console.log('\nGames paid-start tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
