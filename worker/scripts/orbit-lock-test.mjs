/**
 * Orbit Lock — Prompt #176 focused game + security tests.
 * Usage: node worker/scripts/orbit-lock-test.mjs
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const frontendCatalog = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const engineJs = fs.readFileSync(path.join(root, 'app/js/lantern-orbit-lock.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const triviaMissionsJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const playerCss = fs.readFileSync(path.join(root, 'app/css/lantern-game-player.css'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const paidRunSrc = fs.readFileSync(path.join(root, 'worker/game-paid-run-proof.js'), 'utf8');
const cardSvg = fs.readFileSync(path.join(root, 'app/assets/orbit-lock-card.svg'), 'utf8');
const contract169 = fs.readFileSync(path.join(root, 'worker/scripts/nugget-economy-contract-169-test.mjs'), 'utf8');
const contract170 = fs.readFileSync(path.join(root, 'worker/scripts/nugget-balance-contract-170-test.mjs'), 'utf8');

function loadCatalog() {
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(frontendCatalog, sandbox);
  return sandbox.LANTERN_GAME_CATALOG;
}

function loadEngine() {
  const sandbox = {
    window: {},
    globalThis: {},
    Math,
    Number,
    Date,
    String,
    performance: { now: () => 0 },
  };
  sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(engineJs, sandbox);
  return sandbox.LANTERN_ORBIT_LOCK;
}

const cat = loadCatalog();
const engine = loadEngine();
const games = cat.listGames();
const byId = games.filter((g) => g.id === 'orbit-lock');
const orbitBlock = (function () {
  const i = gamesHtml.indexOf('// ---- Orbit Lock');
  return i === -1 ? '' : gamesHtml.slice(i, i + 7000);
})();

// 1. registration
if (byId.length === 1 && cat.getGameById('orbit-lock') && cat.getGameByName('Orbit Lock') === cat.getGameById('orbit-lock')) {
  ok('1. game registered exactly once as orbit-lock / Orbit Lock');
} else bad('1. registration uniqueness', byId.length);

// 2. stable id
if (cat.getGameById('orbit-lock').id === 'orbit-lock' && resolveRegisteredLeaderboardGame('orbit-lock').id === 'orbit-lock') {
  ok('2. stable id orbit-lock on client and server');
} else bad('2. stable id');

// 3. 1 Nugget direct start
if (cat.getGameById('orbit-lock').play_cost === 1 && cat.playCostCardMeta(1) === '1 Nugget = 1 Play' && paidStartJs.includes('return 1')) {
  ok('3. catalog play_cost is exactly 1 Nugget');
} else bad('3. play_cost');

const serverGame = resolveRegisteredLeaderboardGame('orbit-lock');
const serverByName = resolveRegisteredLeaderboardGame('Orbit Lock');
if (serverGame && serverByName && serverGame.id === 'orbit-lock' && serverGame.leaderboard && serverGame.status === 'playable' && serverGame.scoreMin === 0 && serverGame.scoreMax === 6000 && serverGame.lowerIsBetter === false) {
  ok('server allowlist: higher-is-better, bounds 0–6000');
} else bad('server allowlist', serverGame);

if (LANTERN_LEADERBOARD_GAMES.filter((g) => g.id === 'orbit-lock').length === 1) {
  ok('server catalog lists orbit-lock once');
} else bad('server duplicate');

if (engine.STARTING_LIVES === 3 && engine.MAX_STAGE === 20 && engine.SCORE_MIN === 0 && engine.SCORE_MAX === 6000) {
  ok('engine lives/stage/score constants');
} else bad('engine constants');

if (engine.maxPracticalScore() <= engine.SCORE_MAX && engine.maxPracticalScore() === 4450) {
  ok('practical max score is 4450, within server ceiling');
} else bad('practical max', engine.maxPracticalScore());

const perfect = engine.scoreLock(true, 0);
const normal = engine.scoreLock(false, 0);
if (perfect.points > normal.points && normal.points === engine.NORMAL_POINTS) {
  ok('14. perfect hit > normal hit');
} else bad('perfect vs normal', { perfect: perfect.points, normal: normal.points });

const streaked = engine.scoreLock(false, 4);
if (streaked.points > normal.points && streaked.streakBonus === 40) {
  ok('streak adds a bounded bonus');
} else bad('streak bonus', streaked);

const capped = engine.scoreLock(true, 30);
if (capped.streakBonus === engine.STREAK_BONUS_CAP) {
  ok('streak bonus is capped');
} else bad('streak cap', capped);

let seq = 0;
function seededRng() {
  seq = (seq * 1664525 + 1013904223) >>> 0;
  return (seq % 1000) / 1000;
}

const run = engine.createRun({ rng: seededRng });
if (run.lives === 3 && run.stage === 1 && run.score === 0 && !run.ended) {
  ok('3 starting lives, stage 1, score 0');
} else bad('createRun', run);

const targetBefore = run.targetStart;
const beforeLives = run.lives;
run.angle = run.targetStart + run.targetSpan / 2;
const hit = engine.attemptLock(run, { rng: seededRng });
if ((hit.type === 'hit' || hit.type === 'perfect') && run.lives === beforeLives && run.stage === 2 && run.score > 0) {
  ok('success does not remove a life and advances stage / score');
} else bad('success life/stage', hit);

if (run.targetStart !== targetBefore) {
  ok('11. new target generated after successful lock');
} else bad('target not replaced', { targetBefore, now: run.targetStart });

run.angle = (run.targetStart + run.targetSpan + Math.PI) % (Math.PI * 2);
const miss = engine.attemptLock(run, { rng: seededRng });
if (miss.type === 'miss' && run.lives === 2 && !run.ended) {
  ok('13. miss removes one life and continues');
} else bad('miss life', miss);

run.angle = (run.targetStart + run.targetSpan + Math.PI) % (Math.PI * 2);
engine.attemptLock(run, { rng: seededRng });
run.angle = (run.targetStart + run.targetSpan + Math.PI) % (Math.PI * 2);
const last = engine.attemptLock(run, { rng: seededRng });
if (last.type === 'gameover' && run.lives === 0 && run.ended && !run.win) {
  ok('13. game ends at zero lives');
} else bad('game over', last);

const d1 = engine.difficultyForStage(1);
const d10 = engine.difficultyForStage(10);
const d20 = engine.difficultyForStage(20);
if (d1.arcSpan > d10.arcSpan && d10.arcSpan > d20.arcSpan && d1.speed < d10.speed && d10.speed < d20.speed) {
  ok('11. difficulty increases (narrower arc + faster marker)');
} else bad('difficulty curve', { d1, d10, d20 });

if (d20.arcSpan >= engine.MIN_ARC_SPAN) {
  ok('late-stage target remains technically achievable (>= min arc)');
} else bad('min arc', d20.arcSpan);

function reverseTimingOk() {
  var found = false;
  for (var s = 8; s <= 20; s++) if (engine.difficultyForStage(s).reverse) found = true;
  for (var e = 1; e <= 7; e++) if (engine.difficultyForStage(e).reverse) return false;
  return found;
}
if (!d1.reverse && reverseTimingOk()) ok('12. direction reversal starts in later levels only');
else bad('reverse timing');

const reverseStages = [];
for (let s = 1; s <= 20; s++) if (engine.difficultyForStage(s).reverse) reverseStages.push(s);
if (reverseStages.join(',') === '8,11,14,17,20') ok('12. reversals at stages 8/11/14/17/20');
else bad('reverse stages', reverseStages);

// Deterministic late-stage simulation: stage 20 window vs marker speed
const stage20WindowMs = (d20.arcSpan / d20.speed) * 1000;
const stage20PerfectMs = (d20.perfectSpan / d20.speed) * 1000;
if (stage20WindowMs >= 100 && stage20PerfectMs >= 30 && d20.arcSpan >= 0.32) {
  ok('late stage 20 hit window remains technically achievable (' + stage20WindowMs.toFixed(1) + 'ms hit / ' + stage20PerfectMs.toFixed(1) + 'ms perfect)');
} else bad('late stage window', { stage20WindowMs, stage20PerfectMs, d20 });

const dtRun = engine.createRun({ rng: function () { return 0.25; } });
const a0 = dtRun.angle;
engine.tick(dtRun, 16);
const a1 = dtRun.angle;
engine.tick(dtRun, 5000);
const a2 = dtRun.angle;
const stepSmall = Math.abs(a1 - a0);
const stepHuge = Math.abs(a2 - a1);
if (stepSmall > 0 && stepHuge < Math.PI) {
  ok('time-based tick clamps extreme frame delta (no teleport)');
} else bad('delta clamp', { stepSmall, stepHuge });

// 15. restart reset
const r1 = engine.createRun({ rng: function () { return 0.1; } });
r1.score = 900;
r1.stage = 12;
r1.lives = 1;
const r2 = engine.createRun({ rng: function () { return 0.1; } });
if (r2.score === 0 && r2.stage === 1 && r2.lives === 3 && !r2.ended) {
  ok('15. restart createRun resets score/stage/lives');
} else bad('restart reset', r2);

if (!validateLeaderboardScore(serverGame, -1).ok && !validateLeaderboardScore(serverGame, 'NaN').ok && !validateLeaderboardScore(serverGame, 999999).ok) {
  ok('9. negative / NaN / absurd scores rejected');
} else bad('score rejection unit');

if (validateLeaderboardScore(serverGame, 0).ok && validateLeaderboardScore(serverGame, 4450).ok && !validateLeaderboardScore(serverGame, 6001).ok) {
  ok('9. in-range scores accepted; ceiling enforced');
} else bad('score range unit');

if (gamesHtml.includes('id="orbitLockPlayBtn"') && gamesHtml.includes("tryPlay('Orbit Lock'") && gamesHtml.includes("postLeaderboardScore('Orbit Lock'")) {
  ok('games.html wires play trigger, paid tryPlay, and leaderboard post');
} else bad('games.html wiring');

if (gamesHtml.includes('lantern-orbit-lock.js') && gamesHtml.includes('id="orbitLockArea"') && gamesHtml.includes('id="orbitLockCanvas"')) {
  ok('engine script + canvas surface mounted in Game Player host');
} else bad('surface/script');

if (gamesHtml.includes("playAgainBtn.addEventListener('click', startOrbitLockRound") && gamesHtml.includes("function startOrbitLockRound()")) {
  ok('6. Play Again re-enters startOrbitLockRound');
} else bad('play again');

if (orbitBlock.includes("tryPlay('Orbit Lock'") && gamesHtml.match(/function startOrbitLockRound\(\)\{\s*\n[\s\S]{0,400}tryPlay\('Orbit Lock'/)) {
  ok('6. Play Again creates a new paid run via tryPlay');
} else bad('play again tryPlay');

if (engineJs.includes("root._orbitLockWired = true") && engineJs.includes("pointerdown") && engineJs.includes("keydown")) {
  ok('touch/pointer and keyboard handlers exist and are wired once');
} else bad('handlers');

if (engineJs.includes("if (!root._orbitLockWired)") && engineJs.includes('activeMount.lock')) {
  ok('15. restart uses the same listeners (no duplicate event listeners)');
} else bad('duplicate listeners guard');

// 16. input no double-fire
if (engineJs.includes("pointerdown") && !engineJs.includes("addEventListener('click'") && !engineJs.includes('touchstart') && engineJs.includes('ev.repeat') && engineJs.includes('isPrimary === false')) {
  ok('16. one lock path: pointerdown (primary only) + keydown; no click/touchstart double-fire');
} else bad('16. double-fire guards');

if (gamesHtml.includes("params.get('game') === 'orbit-lock'") && !/LANTERN_EDU_TRIVIA|trivia\/run|completeMission|awardGameWinWithEconomy/.test(orbitBlock)) {
  ok('direct Orbit Lock play does not complete a Mission or invent a win reward');
} else bad('mission/win isolation');

if (!triviaMissionsJs.includes('orbit-lock') && !triviaMissionsJs.includes('Orbit Lock')) {
  ok('no Orbit Lock mission invented in educational trivia catalog');
} else bad('unexpected mission');

// 4. #159 proof
if (
  paidStartJs.includes("kind: 'game_play'") &&
  paidStartJs.includes('delta: -cost') &&
  paidStartJs.includes('run_id: runId') &&
  paidStartJs.includes('game_id:') &&
  frontendCatalog.includes("id: 'orbit-lock'") &&
  /play_cost:\s*1/.test(frontendCatalog.slice(frontendCatalog.indexOf("id: 'orbit-lock'"), frontendCatalog.indexOf("id: 'orbit-lock'") + 400))
) {
  ok('4. paid start remains 1 Nugget via current TMS-backed start with run_id + game_id');
} else bad('4. nugget start / #159 client');

if (gamesHtml.includes('run_id: resultRunId') && paidStartJs.includes('getLastRunId') && workerIndex.includes('evaluatePaidGamePlayRun')) {
  ok('4. run_id is sent through current leaderboard record path with paid-run proof');
} else bad('4. run_id client');

// 7. #170 canonical balance
if (
  paidStartJs.includes('refreshBalance({ force: true })') &&
  gamesHtml.includes('LanternWallet.refreshBalance') &&
  walletJs.includes("GET /api/economy/balance") &&
  !orbitBlock.includes('available +=') &&
  !orbitBlock.includes('available -=')
) {
  ok('7. #170 canonical balance refresh; Orbit Lock does not locally mutate wallet');
} else bad('7. #170 balance');

if (gamesPageJs.includes('public_display_name') && gamesPageJs.includes('function leaderboardPublicLabel')) {
  ok('leaderboard uses canonical public_display_name');
} else bad('canonical public name');

if (cardSvg.includes('ORBIT LOCK') && cardSvg.includes('<svg') && !/nintendo|sega|sony|disney|pokemon/i.test(cardSvg)) {
  ok('original geometric card artwork, no donor branding');
} else bad('card art');

if (gamesHtml.includes('touch-action: manipulation') && gamesHtml.includes('orbitLockArea') && gamesHtml.includes('-webkit-user-select: none')) {
  ok('17. mobile: no double-tap zoom / no text selection on play surface');
} else bad('17. mobile css');

if (playerCss.includes('.orbitLockArea') && playerCss.includes('overflow-x: hidden') && playerCss.includes('max-width: min(100%, 560px)')) {
  ok('17. player CSS keeps Orbit Lock single-column and overflow-safe');
} else bad('17. player overflow');

if (gamesHtml.includes('.orbitLockHud{') && gamesHtml.includes('flex-direction: column')) {
  ok('17. HUD is single-column on mobile');
} else bad('17. HUD column');

if (gamesHtml.includes('prefers-reduced-motion') && engineJs.includes('reducedMotion')) {
  ok('prefers-reduced-motion honored without removing the marker');
} else bad('reduced motion');

// 18. reward behavior — candidate did not promise a win Nugget
if (
  engineJs.includes('run.win = true') &&
  !orbitBlock.includes('awardGameWinWithEconomy') &&
  !orbitBlock.includes('game_win') &&
  !orbitBlock.includes('callEconomyTransact')
) {
  ok('18. completing 20 stages is a score/win flag only — no Nugget win reward invented');
} else bad('18. unexpected win reward');

// 19. #159 regression
if (paidRunSrc.includes('evaluatePaidGamePlayRun') && workerIndex.includes("error: 'invalid_run'") && workerIndex.includes('findPaidGamePlayByRunId')) {
  ok('19. #159 paid-run proof remains required for leaderboard record');
} else bad('19. #159 regression');

// 20. #169 regression
if (
  contract169.includes('Prompt #169') &&
  (workerIndex.includes("resolveEconomyAmount(db, 'game_play')") || workerIndex.includes('game_play costs exactly 1 Nugget')) &&
  /kind === 'game_play'/.test(workerIndex)
) {
  ok('20. #169 TMS economy contract still present');
} else bad('20. #169 regression');

// 21. #170 regression
if (contract170.includes('Prompt #170') && walletJs.includes('one signed-in balance state') && paidStartJs.includes('fetchMyBalance')) {
  ok('21. #170 canonical balance contract still present');
} else bad('21. #170 regression');

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
function studentAccount(overrides) {
  return {
    username: '20889',
    display_name: 'Lucas',
    public_display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    teacher_id: null,
    mtss_student_id: '20889',
    staff_id: null,
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
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
      game_name: opts.gameName || '',
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
      async all() {
        if (s.includes('FROM lantern_leaderboard_entries')) {
          return { results: state.entries.filter((e) => !s.includes('WHERE game_name = ?') || e.game_name === binds[0]) };
        }
        return { results: [] };
      },
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
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET };
}
async function postRecord(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const req = new Request('https://lantern.example/api/leaderboards/record', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  const json = await res.json();
  return { status: res.status, json };
}

async function main() {
  const me = studentAccount();
  const cookie = await cookieFor(me);

  {
    const env = makeEnv({ entries: [] });
    const r = await postRecord(env, null, { game_name: 'Orbit Lock', score: 100, run_id: 'orbit-unauth' });
    if (r.status === 401 && r.json.error === 'not_authenticated') ok('unauthenticated Orbit Lock record rejected');
    else bad('unauthenticated', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 400, run_id: 'orbit-no-pay' });
    if (r.status === 400 && r.json.error === 'invalid_run' && state.entries.length === 0) {
      ok('4/8. score without paid game_play run is rejected');
    } else bad('missing paid run', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-run-1' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_id: 'orbit-lock',
      character_name: 'someone_else',
      score: 400,
      score_display: '400 pts · stage 4',
      run_id: 'orbit-run-1',
    });
    const row = state.entries[0];
    if (r.status === 200 && r.json.ok && row && row.character_name === '20889' && row.game_name === 'Orbit Lock') {
      ok('8. valid paid-run score uses server-derived identity 20889');
    } else bad('server identity', { r, row });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-run-dup' });
    const env = makeEnv(state);
    const first = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 250, run_id: 'orbit-run-dup' });
    const second = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 900, run_id: 'orbit-run-dup' });
    if (first.json.ok && second.json.ok && second.json.idempotent && state.entries.length === 1 && state.entries[0].score === 250) {
      ok('5/10. same-run retry is idempotent (one result/run, no second score)');
    } else bad('run_id idempotency', { first, second, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-run-a' });
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-run-b' });
    const env = makeEnv(state);
    const a = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 150, run_id: 'orbit-run-a' });
    const b = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 220, run_id: 'orbit-run-b' });
    if (a.json.ok && b.json.ok && state.entries.length === 2) {
      ok('6. Play Again / new run_id can record a second result');
    } else bad('new run result', { a, b, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-neg' });
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-nan' });
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-huge' });
    const env = makeEnv(state);
    const neg = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: -40, run_id: 'orbit-neg' });
    const nan = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 'NaN', run_id: 'orbit-nan' });
    const huge = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 99999, run_id: 'orbit-huge' });
    if (neg.status === 400 && nan.status === 400 && huge.status === 400 && state.entries.length === 0) {
      ok('9. server rejects negative / NaN / absurd Orbit Lock scores even with paid run');
    } else bad('server bounds', { neg, nan, huge, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Reaction Tap', gameId: 'reaction', runId: 'orbit-wrong-game' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 150, run_id: 'orbit-wrong-game' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('8. paid run for another game cannot score Orbit Lock');
    else bad('wrong game run', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Orbit Lock', gameId: 'orbit-lock', runId: 'orbit-lb' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 150, score_display: '150 pts · stage 1', run_id: 'orbit-lb' });
    if (r.status === 200 && r.json.ok && state.entries[0] && state.entries[0].game_name === 'Orbit Lock') {
      ok('8. leaderboard submission accepted for Orbit Lock with paid run');
    } else bad('leaderboard submit', r);
  }

  // Perfect-window classification
  const pRun = engine.createRun({ rng: function () { return 0.4; } });
  pRun.angle = pRun.targetStart + pRun.targetSpan / 2;
  const classified = engine.classifyLock(pRun.angle, pRun.targetStart, pRun.targetSpan, pRun.perfectSpan);
  if (classified === 'perfect') ok('14. center of arc is Perfect');
  else bad('perfect window center', classified);

  pRun.angle = pRun.targetStart + 0.001;
  const edge = engine.classifyLock(pRun.angle, pRun.targetStart, pRun.targetSpan, pRun.perfectSpan);
  if (edge === 'hit') ok('14. arc edge is a normal hit, not perfect');
  else bad('arc edge class', edge);

  console.log('\norbit-lock-test:', pass, 'PASS', fail, 'FAIL');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
