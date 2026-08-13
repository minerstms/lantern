/**
 * Orbit Lock — Prompt #156 focused game + security tests.
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
const triviaMissionsJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const cardSvg = fs.readFileSync(path.join(root, 'app/assets/orbit-lock-card.svg'), 'utf8');

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

if (byId.length === 1 && cat.getGameById('orbit-lock') && cat.getGameByName('Orbit Lock') === cat.getGameById('orbit-lock')) {
  ok('game registered exactly once as orbit-lock / Orbit Lock');
} else bad('registration uniqueness', byId.length);

if (cat.getGameById('orbit-lock').play_cost === 1 && cat.playCostCardMeta(1) === '1 Nugget = 1 Play') {
  ok('catalog play_cost is exactly 1 Nugget');
} else bad('play_cost');

const serverGame = resolveRegisteredLeaderboardGame('orbit-lock');
const serverByName = resolveRegisteredLeaderboardGame('Orbit Lock');
if (serverGame && serverByName && serverGame.id === 'orbit-lock' && serverGame.leaderboard && serverGame.status === 'playable' && serverGame.scoreMin === 0 && serverGame.scoreMax === 6000) {
  ok('game ID allowlisted server-side with score bounds 0–6000');
} else bad('server allowlist', serverGame);

if (LANTERN_LEADERBOARD_GAMES.filter((g) => g.id === 'orbit-lock').length === 1) {
  ok('server catalog lists orbit-lock once');
} else bad('server duplicate');

if (engine.STARTING_LIVES === 3 && engine.MAX_STAGE === 20 && engine.SCORE_MIN === 0 && engine.SCORE_MAX === 6000) {
  ok('engine lives/stage/score constants');
} else bad('engine constants');

if (engine.maxPracticalScore() <= engine.SCORE_MAX && engine.maxPracticalScore() > 0) {
  ok('practical max score is within server ceiling (' + engine.maxPracticalScore() + ')');
} else bad('practical max', engine.maxPracticalScore());

const perfect = engine.scoreLock(true, 0);
const normal = engine.scoreLock(false, 0);
if (perfect.points > normal.points && normal.points === engine.NORMAL_POINTS) {
  ok('perfect hit > normal hit');
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
  ok('new target generated after successful lock');
} else bad('target not replaced', { targetBefore, now: run.targetStart });

run.angle = (run.targetStart + run.targetSpan + Math.PI) % (Math.PI * 2);
const miss = engine.attemptLock(run, { rng: seededRng });
if (miss.type === 'miss' && run.lives === 2 && !run.ended) {
  ok('miss removes one life and continues');
} else bad('miss life', miss);

run.angle = (run.targetStart + run.targetSpan + Math.PI) % (Math.PI * 2);
engine.attemptLock(run, { rng: seededRng });
run.angle = (run.targetStart + run.targetSpan + Math.PI) % (Math.PI * 2);
const last = engine.attemptLock(run, { rng: seededRng });
if (last.type === 'gameover' && run.lives === 0 && run.ended && !run.win) {
  ok('game ends at zero lives');
} else bad('game over', last);

const d1 = engine.difficultyForStage(1);
const d10 = engine.difficultyForStage(10);
const d20 = engine.difficultyForStage(20);
if (d1.arcSpan > d10.arcSpan && d10.arcSpan > d20.arcSpan && d1.speed < d10.speed && d10.speed < d20.speed) {
  ok('difficulty increases (narrower arc + faster marker)');
} else bad('difficulty curve', { d1, d10, d20 });

if (d20.arcSpan >= engine.MIN_ARC_SPAN) {
  ok('late-stage target remains achievable (>= min arc)');
} else bad('min arc', d20.arcSpan);

if (!d1.reverse && d8OrLater()) ok('direction reversal starts in later levels only');
else bad('reverse timing');
function d8OrLater() {
  var found = false;
  for (var s = 8; s <= 20; s++) if (engine.difficultyForStage(s).reverse) found = true;
  for (var e = 1; e <= 7; e++) if (engine.difficultyForStage(e).reverse) return false;
  return found;
}

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

if (!validateLeaderboardScore(serverGame, -1).ok && !validateLeaderboardScore(serverGame, 'NaN').ok && !validateLeaderboardScore(serverGame, 999999).ok) {
  ok('negative / NaN / absurd scores rejected');
} else bad('score rejection unit');

if (validateLeaderboardScore(serverGame, 0).ok && validateLeaderboardScore(serverGame, 4450).ok && !validateLeaderboardScore(serverGame, 6001).ok) {
  ok('in-range scores accepted; ceiling enforced');
} else bad('score range unit');

if (gamesHtml.includes('id="orbitLockPlayBtn"') && gamesHtml.includes("tryPlay('Orbit Lock'") && gamesHtml.includes("postLeaderboardScore('Orbit Lock'")) {
  ok('games.html wires play trigger, paid tryPlay, and leaderboard post');
} else bad('games.html wiring');

if (gamesHtml.includes('lantern-orbit-lock.js') && gamesHtml.includes('id="orbitLockArea"') && gamesHtml.includes('id="orbitLockCanvas"')) {
  ok('engine script + canvas surface mounted in Game Player host');
} else bad('surface/script');

if (gamesHtml.includes("playAgainBtn.addEventListener('click', startOrbitLockRound") && gamesHtml.includes("function startOrbitLockRound()")) {
  ok('Play Again re-enters startOrbitLockRound');
} else bad('play again');

if (engineJs.includes("root._orbitLockWired = true") && engineJs.includes("pointerdown") && engineJs.includes("keydown")) {
  ok('touch/pointer and keyboard handlers exist and are wired once');
} else bad('handlers');

if (engineJs.includes("if (!root._orbitLockWired)") && engineJs.includes('activeMount.lock')) {
  ok('restart uses the same listeners (no duplicate event listeners)');
} else bad('duplicate listeners guard');

if (gamesHtml.includes("params.get('game') === 'orbit-lock'") && !/LANTERN_EDU_TRIVIA|trivia\/run|completeMission/.test(orbitBlock())) {
  ok('direct Orbit Lock play does not complete a Mission');
} else bad('mission isolation');
function orbitBlock() {
  const i = gamesHtml.indexOf('// ---- Orbit Lock');
  return i === -1 ? gamesHtml : gamesHtml.slice(i, i + 5000);
}

if (!triviaMissionsJs.includes('orbit-lock') && !triviaMissionsJs.includes('Orbit Lock')) {
  ok('no Orbit Lock mission invented in educational trivia catalog');
} else bad('unexpected mission');

if (paidStartJs.includes("kind: 'game_play'") && paidStartJs.includes('delta: -cost') && frontendCatalog.includes("id: 'orbit-lock'") && /play_cost:\s*1/.test(frontendCatalog.slice(frontendCatalog.indexOf("id: 'orbit-lock'"), frontendCatalog.indexOf("id: 'orbit-lock'") + 400))) {
  ok('paid start remains 1 Nugget via current TMS-backed start');
} else bad('nugget start');

if (gamesHtml.includes('payload.run_id') && paidStartJs.includes('getLastRunId')) {
  ok('run_id is sent through current leaderboard record path');
} else bad('run_id client');

if (gamesPageJs.includes('public_display_name') && gamesPageJs.includes('function leaderboardPublicLabel')) {
  ok('leaderboard uses canonical public_display_name (Prompt #151 identity)');
} else bad('canonical public name');

if (cardSvg.includes('ORBIT LOCK') && cardSvg.includes('<svg') && !/nintendo|sega|sony|disney|pokemon/i.test(cardSvg)) {
  ok('original geometric card artwork, no donor branding');
} else bad('card art');

if (gamesHtml.includes('touch-action: manipulation') && gamesHtml.includes('orbitLockArea') && gamesHtml.includes('-webkit-user-select: none')) {
  ok('mobile: no double-tap zoom / no text selection on play surface');
} else bad('mobile css');

if (gamesHtml.includes('prefers-reduced-motion') && engineJs.includes('reducedMotion')) {
  ok('prefers-reduced-motion honored without removing the marker');
} else bad('reduced motion');

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
function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.entries = state.entries || [];
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
  {
    const env = makeEnv({ entries: [] });
    const r = await postRecord(env, null, { game_name: 'Orbit Lock', score: 100 });
    if (r.status === 401 && r.json.error === 'not_authenticated') ok('unauthenticated Orbit Lock record rejected');
    else bad('unauthenticated', r);
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const r = await postRecord(env, cookie, {
      game_id: 'orbit-lock',
      character_name: 'someone_else',
      score: 400,
      score_display: '400 pts · stage 4',
      run_id: 'orbit-run-1',
    });
    const row = state.entries[0];
    if (r.status === 200 && r.json.ok && row && row.character_name === '20889' && row.game_name === 'Orbit Lock') {
      ok('valid paid-run score uses server-derived identity 20889');
    } else bad('server identity', { r, row });
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const first = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 250, run_id: 'orbit-run-dup' });
    const second = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 900, run_id: 'orbit-run-dup' });
    if (first.json.ok && second.json.ok && second.json.idempotent && state.entries.length === 1 && state.entries[0].score === 250) {
      ok('run_id cannot score twice (idempotent)');
    } else bad('run_id idempotency', { first, second, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const neg = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: -40, run_id: 'orbit-neg' });
    const nan = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 'NaN', run_id: 'orbit-nan' });
    const huge = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 99999, run_id: 'orbit-huge' });
    if (neg.status === 400 && nan.status === 400 && huge.status === 400 && state.entries.length === 0) {
      ok('server rejects negative / NaN / absurd Orbit Lock scores');
    } else bad('server bounds', { neg, nan, huge, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const r = await postRecord(env, cookie, { game_name: 'Orbit Lock', score: 150, score_display: '150 pts · stage 1', run_id: 'orbit-lb' });
    if (r.status === 200 && r.json.ok && state.entries[0] && state.entries[0].game_name === 'Orbit Lock') {
      ok('leaderboard submission accepted for Orbit Lock');
    } else bad('leaderboard submit', r);
  }

  console.log('\norbit-lock-test:', pass, 'PASS', fail, 'FAIL');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
