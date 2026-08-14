/**
 * Stack Lab (id `tower`) durable integration against current Lantern architecture.
 *
 * Covers paid-run proof (#159), TMS economy (#169), canonical balance (#170),
 * catalog registration, scoring bounds, win reward, mobile controls, and
 * gameplay preservation of the donor Stack Lab candidate.
 *
 * Usage: node worker/scripts/tower-platform-integration-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  validateLeaderboardScore,
} from '../lantern-game-catalog.js';
import { PAID_RUN_RESULT_WINDOW_MS } from '../game-paid-run-proof.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const catalogJs = read('app/js/lantern-game-catalog.js');
const paidStartJs = read('app/js/lantern-games-paid-start.js');
const walletJs = read('app/js/lantern-wallet.js');
const gamesHtml = read('app/games.html');
const gamesPageJs = read('app/js/lantern-games-page.js');
const playerJs = read('app/js/lantern-game-player.js');
const playerCss = read('app/css/lantern-game-player.css');
const bridgeJs = read('app/js/lantern-game-bridge.js');
const adapterJs = read('app/games/tower/lantern-adapter.js');
const gameHtml = read('app/games/tower/index.html');
const labHtml = read('app/game-lab/tower.html');
const navJs = read('app/js/lantern-nav.js');
const staffNavJs = read('app/js/lantern-staff-nav.js');
const tickerJs = read('app/js/lantern-ticker.js');
const workerIndex = read('worker/index.js');
const exploreHtml = read('app/explore.html');
const missionsHtml = read('app/missions.html');
const createHtml = read('app/contribute.html');
const teacherHtml = read('app/teacher.html');
const provenance = read('app/games/tower/GAME_PROVENANCE.md');
const notices = read('app/games/tower/THIRD_PARTY_NOTICES.md');
const license = read('app/games/tower/LICENSE');
const proof159 = read('worker/scripts/game-paid-run-proof-159-test.mjs');
const economy169 = read('worker/scripts/nugget-economy-contract-169-test.mjs');
const balance170 = read('worker/scripts/nugget-balance-contract-170-test.mjs');

const ORIGINAL_NINE = [
  'Avatar Match',
  'Lantern Live Trivia',
  'Handbook Trivia',
  'Local History Trivia',
  'SRP Safety Challenge',
  'Reaction Tap',
  'Nugget Click Rush',
  'Memory Match',
  'Nugget Hunt',
];

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;
const games = cat.listGames();
const tower = cat.getGameById('tower');
const towerByName = cat.getGameByName('Stack Lab');

// 1 / 2 / 3 — registered exactly once, id tower, public name Stack Lab
if (tower && towerByName && tower.id === 'tower' && tower.name === 'Stack Lab' && tower.play_cost === 1) {
  ok('1/3/4. Stack Lab registered once in frontend catalog (id tower / name Stack Lab / cost 1)');
} else bad('1. frontend catalog', tower);
if (games.filter((g) => g.id === 'tower' || g.name === 'Stack Lab').length === 1) {
  ok('1b. Play catalog contains Stack Lab exactly once');
} else bad('1b. catalog tower count');
const serverTower = resolveRegisteredLeaderboardGame('tower');
if (serverTower && serverTower.name === 'Stack Lab' && !serverTower.lowerIsBetter) {
  ok('1c. Stack Lab registered in server catalog, higher-is-better');
} else bad('1c. server catalog', serverTower);
if (LANTERN_LEADERBOARD_GAMES.filter((g) => g.id === 'tower').length === 1) {
  ok('1d. tower appears exactly once in the server catalog');
} else bad('1d. server catalog duplicates');
if ((gamesHtml.match(/id="towerPlayBtn"/g) || []).length === 1) {
  ok('1e. Play page has exactly one Stack Lab play trigger');
} else bad('1e. play button count');

// 20 — existing catalog games remain
const missing = ORIGINAL_NINE.filter((name) => !cat.getGameByName(name));
if (missing.length === 0 && games.length === 10) {
  ok('20. existing 9 games remain; catalog is 10');
} else bad('20. existing games', { missing, count: games.length });
ORIGINAL_NINE.forEach(function (name) {
  if (gamesHtml.includes("tryPlay('" + name + "'")) ok('20b. existing play path intact: ' + name);
  else bad('20b. missing tryPlay', name);
});

// 4 / 5 — direct play costs exactly 1 Nugget via current paid-start
if (gamesHtml.includes("tryPlay('Stack Lab'") && gamesHtml.includes('LanternGamesPaidStart.startPaidGame') && tower.play_cost === 1) {
  ok('4/5. Stack Lab uses shared paid-start; play_cost is 1 Nugget');
} else bad('4/5. paid start');
if (paidStartJs.includes("kind: 'game_play'") && paidStartJs.includes('delta: -cost') && paidStartJs.includes('game_id:')) {
  ok('5b. game_play uses current run architecture (delta -cost, meta.game_id)');
} else bad('5b. paid-run meta');
if (paidStartJs.includes('generateRunId') && paidStartJs.includes('lastRunId') && paidStartJs.includes('getLastRunId')) {
  ok('5c. paid start persists a stable run_id');
} else bad('5c. run_id generation');

// 6 — same-run retry does not double debit
if (paidStartJs.includes('spendInFlight') && workerIndex.includes('lantern:${kind}:${') && workerIndex.includes("kind === 'game_play'")) {
  ok('6. same-run retry is client in-flight gated and TMS-idempotent on run_id');
} else bad('6. double-debit guards');

// 7 — Play Again creates a new paid run
if (
  gamesHtml.includes("playAgainBtn.addEventListener('click', startTowerRound)") &&
  gamesHtml.includes('function startTowerRound') &&
  gamesHtml.includes("tryPlay('Stack Lab'")
) {
  ok('7. Play Again re-enters tryPlay (new paid run)');
} else bad('7. Play Again');

// 12 / 13 — #170 canonical balance, no local wallet authority
if (
  paidStartJs.includes('LanternWallet.refreshBalance') &&
  walletJs.includes('bindElement') &&
  walletJs.includes('refreshBalance') &&
  gamesHtml.includes('LanternWallet.refreshBalance') &&
  !paidStartJs.includes('available - cost') &&
  !paidStartJs.includes('available - 1') &&
  !walletJs.includes('applyVisibleBalance') &&
  !gamesHtml.includes('lantern_wallets')
) {
  ok('12/13. paid start refreshes #170 canonical balance; no local decrement or lantern_wallets');
} else bad('12/13. balance contract');

// 8 / 9 / 10 — score requires valid run proof; one result/run; game id cannot be forged
const proofJs = read('worker/game-paid-run-proof.js');
const postFn = gamesHtml.slice(gamesHtml.indexOf('function postLeaderboardScore'), gamesHtml.indexOf('function postLeaderboardScore') + 2800);
if (
  gamesHtml.includes("postLeaderboardScore('Stack Lab'") &&
  postFn.includes('!resultRunId') &&
  postFn.includes('run_id: resultRunId') &&
  postFn.includes('getLastRunId')
) {
  ok('8. Stack Lab score POST requires paid getLastRunId / run_id');
} else bad('8. score run proof');
if (workerIndex.includes('evaluatePaidGamePlayRun') && workerIndex.includes("error: 'invalid_run'")) {
  ok('8b. Worker record path requires #159 paid-run proof');
} else bad('8b. worker proof');
if (workerIndex.includes("json_extract(meta_json, '$.run_id')") && gamesHtml.includes('leaderboardSubmitGuard')) {
  ok('9. one leaderboard result per run (server run_id + client submit guard)');
} else bad('9. one result/run');
if (paidStartJs.includes('game_id:') && proofJs.includes('paidRunGameMatches') && workerIndex.includes('evaluatePaidGamePlayRun')) {
  ok('10. game id is bound on paid start and matched at record time (cannot forge)');
} else bad('10. game id binding');

// 11 — score bounds
const utils = read('app/games/tower/donor/src/utils.js');
if (utils.includes('successScore || 25') && utils.includes('perfectScore || 25') && tower.scoring && tower.scoring.lowerIsBetter === false) {
  ok('11. Stack Lab score is donor higher-is-better floor/perfect model');
} else bad('11. score model');
const towerScore = validateLeaderboardScore(serverTower, 250);
if (towerScore.ok && towerScore.score === 250) ok('11b. legitimate Stack Lab score 250 accepted');
else bad('11b. score validate', towerScore);
if (validateLeaderboardScore(serverTower, 1625).ok) ok('11c. perfect-ish 1625 accepted');
else bad('11c. 1625');
if (!validateLeaderboardScore(serverTower, -1).ok) ok('11d. negative score rejected');
else bad('11d. negative score');
if (!validateLeaderboardScore(serverTower, Number.NaN).ok) ok('11e. NaN score rejected');
else bad('11e. NaN');
if (serverTower.scoreMax === 2500 && !validateLeaderboardScore(serverTower, 2501).ok) {
  ok('11f. scoreMax is 2500; 2501 rejected');
} else bad('11f. scoreMax', serverTower && serverTower.scoreMax);
if (adapterJs.includes('if (n > 2500) return 2500') && gameHtml.includes('SCORE_MAX = 2500') && gamesHtml.includes('SCORE_MAX = 2500')) {
  ok('11g. client/adapter/parent all clamp to 2500');
} else bad('11g. client clamp');

// 16 / 17 — win condition + game-over/restart
if (adapterJs.includes("notifyGameEnded('completed')") && gameHtml.includes('QUALIFYING_FLOORS') && tower.qualifyingWin && tower.qualifyingWin.floors === 10) {
  ok('16. 10-floor win condition still ends the run');
} else bad('16. win completion');
if (adapterJs.includes("notifyGameEnded('hp_depleted')") && gameHtml.includes('f >= 3') && gamesHtml.includes('id="towerPlayAgainBtn"')) {
  ok('17. three-miss game-over + Play Again restart remain');
} else bad('17. game-over/restart');

// 18 / 19 — +1 win reward retained, duplicate win cannot double reward
if (gamesHtml.includes('floors >= QUALIFYING_FLOORS') && gamesHtml.includes("awardGameWinWithEconomy(adopted.name, 'Stack Lab', 1")) {
  ok('18. qualifying win calls awardGameWinWithEconomy with +1 keyed to towerRunId');
} else bad('18. win award call');
if (gamesHtml.includes('+1 Nugget!') && gamesHtml.includes('to earn +1 Nugget')) {
  ok('18b. UI still explicitly promises the +1 win reward');
} else bad('18b. UI promise');
if (gamesHtml.includes('if (endedOnce) return') && gamesHtml.match(/awardGameWinWithEconomy\([\s\S]{0,400}towerRunId/) && workerIndex.includes('lantern:${kind}:${')) {
  ok('19. endedOnce + run_id prevent duplicate win reward');
} else bad('19. win idempotency');
if (gamesHtml.includes('if (won && adopted)')) {
  ok('18c. non-qualifying loss does not award');
} else bad('18c. loss gate');

// Identity / donor isolation
if (gamesHtml.includes("postLeaderboardScore('Stack Lab'") && !/function postLeaderboardScore[\s\S]{0,900}character_name\s*:/.test(gamesHtml)) {
  ok('identity. postLeaderboardScore does not send character_name');
} else bad('identity. character_name in record payload');
if (bridgeJs.includes('never send client-authoritative character_name') && bridgeJs.includes("error: 'missing_run_id'")) {
  ok('identity b. bridge requires run_id and does not post character_name');
} else bad('identity b. bridge contract');
if (adapterJs.includes('stripForbidden') && adapterJs.includes('must NEVER send')) {
  ok('identity c. donor adapter forbids identity/reward fields');
} else bad('identity c. adapter contract');
if (!adapterJs.includes('/api/economy') && !gameHtml.includes('/api/economy') && !gameHtml.includes('/api/leaderboards')) {
  ok('identity d. iframe donor code does not call economy or leaderboard APIs');
} else bad('identity d. iframe API calls');

// 14 — mobile controls do not double-trigger
if (
  gameHtml.includes('lanternPlace') &&
  gameHtml.includes('lastPlaceAt') &&
  gameHtml.includes('now - lastPlaceAt < 90') &&
  gameHtml.includes('pointerdown') &&
  gameHtml.includes('keydown') &&
  gameHtml.includes('e.repeat')
) {
  ok('14. place input is debounced 90ms; key repeat ignored; pointerdown not duplicated with click');
} else bad('14. mobile double-trigger');

// 15 — canvas does not overflow representative mobile viewport
if (
  playerCss.includes('.towerGameSurface') &&
  playerCss.includes('overflow: hidden') &&
  playerCss.includes('max-width: 100%') &&
  gamesHtml.includes('overflow-x: hidden') &&
  gameHtml.includes('overflow-x:hidden') &&
  !gameHtml.includes('orientation: landscape')
) {
  ok('15. canvas/player clipped, single-column, portrait-ok');
} else bad('15. mobile/overflow');

// Player shell / iframe isolation
if (
  gamesHtml.includes('id="towerGameSurface"') &&
  gamesHtml.includes('id="towerPlayFrame"') &&
  gamesHtml.includes('/games/tower/index.html?lanternPlay=1') &&
  gamesHtml.includes('lantern-game-bridge.js')
) {
  ok('Play shell iframes same-origin Stack Lab after paid start');
} else bad('player iframe wiring');
if (gameHtml.includes('lanternPlay') && gameHtml.includes('if (lanternPlay) return')) {
  ok('production iframe disables donor free-replay reload');
} else bad('donor replay gate');
if (gameHtml.includes('engineReady') && gameHtml.includes('pendingBegin') && gameHtml.includes('__lanternTowerBeginPlay')) {
  ok('Play beginPlay waits until the donor engine is inited');
} else bad('beginPlay init gate');
if (gameHtml.includes('.labOver.hide') && gameHtml.includes('display:none!important')) {
  ok('lab overlay hide class cannot be overridden by .labOver display:flex');
} else bad('lab overlay hide specificity');
if (gamesHtml.includes('__LANTERN_TOWER_PLAYTEST__') && gameHtml.includes('__LANTERN_TOWER_TEST__')) {
  ok('deterministic win/miss test hooks exist for playtest');
} else bad('test hooks');

// Ticker
if (tickerJs.includes("'Stack Lab'")) {
  ok('Stack Lab is on the shared ticker display list');
} else bad('ticker');

// Marquee hook stays generic
if (workerIndex.includes('detectLeaderboardEntryTransition') && !gamesHtml.includes('tower-specific marquee')) {
  ok('generic marquee integration remains on leaderboard insert');
} else bad('marquee hook');

// Lab remains unlinked
const navSurfaces = [
  ['games.html', gamesHtml],
  ['explore.html', exploreHtml],
  ['missions.html', missionsHtml],
  ['contribute.html', createHtml],
  ['teacher.html', teacherHtml],
  ['lantern-nav.js', navJs],
  ['lantern-staff-nav.js', staffNavJs],
];
let labLinked = false;
navSurfaces.forEach(function (pair) {
  if (pair[1].includes('game-lab/tower')) labLinked = true;
});
if (!labLinked && exists('app/game-lab/tower.html') && labHtml.includes('PREVIEW MODE — RESULTS NOT SAVED')) {
  ok('lab /game-lab/tower.html remains unlinked preview-only diagnostic');
} else bad('lab link or missing lab');
if (
  !gamesHtml.includes('towerLabStatus') &&
  !gamesHtml.includes('PREVIEW MODE — RESULTS NOT SAVED') &&
  gamesHtml.includes('id="towerGameResult"')
) {
  ok('Play player has result overlay, not lab diagnostics');
} else bad('diagnostics leaked into Play');

// Assets / license
if (exists('app/assets/tower-card.png') && tower.image === 'assets/tower-card.png') {
  ok('Play card uses Lantern-owned catalog artwork');
} else bad('card artwork');
const cardBytes = fs.readFileSync(path.join(root, 'app/assets/tower-card.png'));
if (cardBytes.length > 800 && cardBytes[0] === 0x89 && cardBytes[1] === 0x50) {
  ok('Play card is a real PNG');
} else bad('Play card PNG header');

const spritesJs = read('app/games/tower/lantern-sprites.js');
const sfxJs = read('app/games/tower/lantern-sfx.js');
const distJs = read('app/games/tower/donor/dist/main.js');
const srcIndex = read('app/games/tower/donor/src/index.js');

if (
  exists('app/games/tower/lantern-sprites.js') &&
  gameHtml.includes('/games/tower/lantern-sprites.js') &&
  spritesJs.includes('LanternTowerAssets')
) {
  ok('original Lantern sprites referenced at runtime');
} else bad('lantern sprites');
if (
  exists('app/games/tower/lantern-sfx.js') &&
  gameHtml.includes('soundOn: false') &&
  sfxJs.includes('Web Audio') &&
  !gameHtml.includes('bgm.mp3') &&
  !gameHtml.includes('Caketown')
) {
  ok('no runtime Caketown; Web Audio SFX used');
} else bad('runtime audio');

const DONOR_MEDIA = [
  'bgm.mp3', 'bgm.ogg', 'drop.mp3', 'drop.ogg', 'drop-perfect.mp3', 'drop-perfect.ogg',
  'rotate.mp3', 'rotate.ogg', 'game-over.mp3', 'game-over.ogg',
  'background.png', 'hook.png', 'block.png', 'block-perfect.png', 'block-rope.png', 'rope.png',
  'heart.png', 'score.png', 'tutorial.png', 'tutorial-arrow.png',
  'c1.png', 'c2.png', 'c3.png', 'c4.png', 'c5.png', 'c6.png', 'c7.png', 'c8.png',
  'f1.png', 'f2.png', 'f3.png', 'f4.png', 'f5.png', 'f6.png', 'f7.png',
  'main-index-logo.png', 'main-loading-logo.png', 'main-index-title.png', 'main-index-start.png',
  'main-bg.png', 'main-modal-over.png', 'main-modal-again-b.png', 'main-modal-invite-b.png',
  'main-modal-bg.png', 'main-share-icon.png', 'main-loading.gif', 'favicon.png',
];
function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}
const appFiles = walkFiles(path.join(root, 'app'));
const towerFiles = walkFiles(path.join(root, 'app/games/tower'));
const donorMediaHits = appFiles.filter((f) => {
  const base = path.basename(f);
  if (!DONOR_MEDIA.includes(base)) return false;
  if (base === 'favicon.png' && f.replace(/\\/g, '/').endsWith('/app/assets/favicon.png')) return false;
  return true;
});
if (donorMediaHits.length === 0) ok('no donor media filenames under app/ shipping tree');
else bad('donor media still publishable', donorMediaHits.map((f) => path.relative(root, f)));

const towerMedia = towerFiles.filter((f) => /\.(mp3|ogg|wav|png|gif|jpg|jpeg|ico|ttf|woff2?|eot)$/i.test(f));
if (towerMedia.length === 0) ok('no binary media files under app/games/tower/');
else bad('tower media files', towerMedia.map((f) => path.relative(root, f)));

if (!exists('app/games/tower/donor/assets') && !exists('app/games/tower/donor/index.html')) {
  ok('donor/assets and donor/index.html are gone from shipping tree');
} else bad('donor snapshot still present');

if (
  !gameHtml.includes('BMQB') &&
  !gameHtml.includes('贝米') &&
  !spritesJs.includes('BMQB') &&
  !sfxJs.includes('BMQB') &&
  !adapterJs.includes('BMQB')
) {
  ok('no runtime BMQB branding');
} else bad('runtime BMQB');
if (
  !gameHtml.includes('wenxue') &&
  !distJs.includes('wenxue') &&
  srcIndex.includes('LanternTowerAssets') &&
  utils.includes("'Arial,Helvetica,sans-serif'") &&
  !exists('app/games/tower/donor/assets/wenxue.ttf')
) {
  ok('no wenxue runtime dependency or font file');
} else bad('wenxue');
if (
  !gameHtml.includes('googletagmanager') &&
  !gameHtml.includes('google-analytics') &&
  !distJs.includes('googletagmanager')
) {
  ok('no donor Analytics');
} else bad('analytics');
if (
  license.includes('Copyright (c) 2018 BMQB, Inc') &&
  notices.includes('MIT License') &&
  notices.includes('cooljs') &&
  notices.includes('Zepto') &&
  notices.includes('Caketown') &&
  provenance.includes('not retained') &&
  exists('app/games/tower/LICENSE') &&
  exists('app/games/tower/donor/LICENSE') &&
  exists('app/games/tower/GAME_PROVENANCE.md') &&
  exists('app/games/tower/vendor/zepto-1.1.6.min.js')
) {
  ok('MIT/ISC/Zepto notices retained; Caketown documented as removed');
} else bad('notices');

// 21 / 22 / 23 — existing contract suites remain
if (proof159.includes('evaluatePaidGamePlayRun') && proof159.includes('invalid_run')) {
  ok('21. #159 paid-run proof suite still present');
} else bad('21. #159 suite');
if (economy169.includes('poll_reward_via_vote_only') || economy169.includes('Nugget Economy Contract')) {
  ok('22. #169 economy contract suite still present');
} else bad('22. #169 suite');
if (balance170.includes('Canonical Nugget balance') && balance170.includes('refreshBalance')) {
  ok('23. #170 canonical balance suite still present');
} else bad('23. #170 suite');
if (PAID_RUN_RESULT_WINDOW_MS === 60 * 60 * 1000) ok('#159 result window remains 60 minutes');
else bad('result window', PAID_RUN_RESULT_WINDOW_MS);

// Insufficient balance UX remains
if (paidStartJs.includes("'insufficient'") && playerJs.includes('You need 1 Nugget to play')) {
  ok('insufficient balance uses existing pregame UX and does not start');
} else bad('insufficient UX');

// First Game Played stays on existing game_play path
if (
  paidStartJs.includes('completeFirstGameLocal') &&
  workerIndex.includes('ensureFirstGameMissionCompletion') &&
  !gamesHtml.includes('first_game')
) {
  ok('First Game Played stays on existing game_play path; no Tower-specific mission');
} else bad('first game');

// ---------------------------------------------------------------------------
// Live Worker: unauthenticated / spoof / paid-run proof / bounds / idempotency
// ---------------------------------------------------------------------------
const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}
async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: account.username,
    role: account.role,
    scn: account.student_character_name || null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}
function studentAccount() {
  return {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    teacher_id: null,
    mtss_student_id: '20889',
    staff_id: null,
    is_active: 1,
    must_change_password: 0,
  };
}
function addPaidRun(state, opts) {
  state.transactions = state.transactions || [];
  state.transactions.push({
    id: opts.id || ('tx-' + opts.runId),
    character_name: opts.characterName,
    delta: opts.delta != null ? opts.delta : -1,
    kind: opts.kind || 'game_play',
    source: 'GAME',
    note: opts.note != null ? opts.note : opts.gameName,
    created_at: opts.createdAt || new Date().toISOString(),
    meta_json: JSON.stringify({
      game_name: opts.gameName,
      game_id: opts.gameId || '',
      run_id: opts.runId,
    }),
  });
}
function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.entries = state.entries || [];
  state.transactions = state.transactions || [];
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        if (s.includes('FROM lantern_transactions') && s.includes("json_extract(meta_json, '$.run_id')")) {
          const runId = binds[0];
          return state.transactions.find((t) => {
            let meta = {};
            try { meta = JSON.parse(t.meta_json || '{}'); } catch (_) {}
            return t.kind === 'game_play' && meta.run_id === runId;
          }) || null;
        }
        if (s.includes('FROM lantern_leaderboard_entries') && s.includes("json_extract(meta_json, '$.run_id')")) {
          const characterName = binds[0];
          const gameName = binds[1];
          const runId = binds[2];
          return state.entries.find((e) => {
            let meta = {};
            try { meta = JSON.parse(e.meta_json || '{}'); } catch (_) {}
            return e.character_name === characterName && e.game_name === gameName && meta.run_id === runId;
          }) || null;
        }
        return null;
      },
      async all() { return { results: state.entries.slice() }; },
      async run() {
        if (s.includes('INSERT INTO lantern_leaderboard_entries')) {
          state.entries.push({
            id: binds[0],
            game_name: binds[1],
            character_name: binds[2],
            score: binds[3],
            score_display: binds[4],
            meta_json: binds[5],
            created_at: binds[6],
          });
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
  };
}
async function postRecord(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const req = new Request('https://lantern.example/api/leaderboards/record', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

async function main() {
  const me = studentAccount();
  const cookie = await cookieFor(me);

  {
    const env = makeEnv({ entries: [] });
    const r = await postRecord(env, null, { game_name: 'Stack Lab', score: 100, character_name: 'spoof' });
    if (r.status === 401 && r.json && r.json.error === 'not_authenticated') {
      ok('live. Stack Lab cannot submit score unauthenticated');
    } else bad('live. unauthenticated', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_name: 'Stack Lab',
      score: 175,
      score_display: '175 pts',
      run_id: 'tower-missing-play',
    });
    if (r.status === 400 && r.json && r.json.error === 'invalid_run' && state.entries.length === 0) {
      ok('live. score without a paid game_play run is rejected');
    } else bad('live. missing paid run', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Stack Lab', gameId: 'tower', runId: 'tower-int-1' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_name: 'Stack Lab',
      character_name: 'DONOR_MUST_BE_IGNORED',
      score: 175,
      score_display: '175 pts',
      run_id: 'tower-int-1',
    });
    const row = state.entries[0];
    if (r.status === 200 && r.json.ok && r.json.character_name === '20889' && row && row.character_name === '20889' && row.game_name === 'Stack Lab') {
      ok('live. Stack Lab record identity is session 20889; donor spoof ignored');
    } else bad('live. spoof', { r, row });
    const retry = await postRecord(env, cookie, {
      game_name: 'Stack Lab',
      score: 999,
      score_display: '999 pts',
      run_id: 'tower-int-1',
    });
    if (retry.json && retry.json.idempotent === true && state.entries.length === 1 && state.entries[0].score === 175) {
      ok('live. same-run retry does not duplicate or overwrite the leaderboard row');
    } else bad('live. retry', { retry, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Reaction Tap', gameId: 'reaction', runId: 'tower-wrong-game' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_name: 'Stack Lab',
      score: 200,
      run_id: 'tower-wrong-game',
    });
    if (r.status === 400 && r.json && r.json.error === 'invalid_run') {
      ok('live. Stack Lab cannot forge a result onto another game\'s paid run');
    } else bad('live. forged game id', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Stack Lab', gameId: 'tower', runId: 'tower-over' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_name: 'Stack Lab',
      score: 2501,
      run_id: 'tower-over',
    });
    if (r.status === 400 && r.json && r.json.error === 'score_out_of_range') {
      ok('live. Stack Lab score 2501 is rejected');
    } else bad('live. score max', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Stack Lab', gameId: 'tower', runId: 'tower-new' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_name: 'Stack Lab',
      score: 250,
      run_id: 'tower-new',
    });
    if (r.status === 200 && r.json && r.json.ok) {
      ok('live. Play Again-style new run_id can record a new result');
    } else bad('live. new run', r);
  }

  console.log('\nStack Lab platform integration:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
