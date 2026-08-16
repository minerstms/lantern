/**
 * Minecart Switch — Prompt #175 current-main integration tests.
 * Usage: node worker/scripts/minecart-switch-175-test.mjs
 *
 * Covers registration, paid-run proof (#159), economy (#169/#170),
 * solvable routes, lives, restart, duplicate-touch, mobile overflow,
 * timer cleanup, and explicit no-game_win reward contract.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  isLowerIsBetterGame,
  validateLeaderboardScore,
} from '../lantern-game-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}

const engineJs = fs.readFileSync(path.join(root, 'app/js/lantern-minecart-switch.js'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const workerCatalog = fs.readFileSync(path.join(root, 'worker/lantern-game-catalog.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const triviaMissionsJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/css/lantern-minecart-switch.css'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const paidProofJs = fs.readFileSync(path.join(root, 'worker/game-paid-run-proof.js'), 'utf8');
const contractDoc = fs.readFileSync(path.join(root, 'docs/NUGGET_ECONOMY_CONTRACT.md'), 'utf8');
const balance170 = fs.readFileSync(path.join(root, 'worker/scripts/nugget-balance-contract-170-test.mjs'), 'utf8');
const economy169 = fs.readFileSync(path.join(root, 'worker/scripts/nugget-economy-contract-169-test.mjs'), 'utf8');
const proof159 = fs.readFileSync(path.join(root, 'worker/scripts/game-paid-run-proof-159-test.mjs'), 'utf8');

const sandbox = { window: {}, globalThis: {}, console, Math, Number, Date, Object, Array, String };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
vm.runInNewContext(engineJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;
const MCS = sandbox.LANTERN_MINECART_SWITCH;

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
    public_display_name: 'Lucas',
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
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
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
          return state.entries.find((e) => {
            let meta = {};
            try { meta = JSON.parse(e.meta_json || '{}'); } catch (_) {}
            return e.character_name === binds[0] && e.game_name === binds[1] && meta.run_id === binds[2];
          }) || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
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
  if (cookie) headers.Cookie = cookie;
  const req = new Request('https://lantern.example/api/leaderboards/record', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  const json = await res.json();
  return { status: res.status, json };
}

const minecartHostStart = gamesHtml.indexOf('Minecart Switch: paid start');
const minecartHost = minecartHostStart === -1 ? '' : gamesHtml.slice(minecartHostStart, minecartHostStart + 4200);
const named = cat.listGames().filter((g) => g.name === 'Minecart Switch');
const ids = cat.listGames().map((g) => g.id);
const serverGame = resolveRegisteredLeaderboardGame('minecart-switch');

// 1. current game registration
if (
  named.length === 1 &&
  named[0].id === 'minecart-switch' &&
  named[0].playBtnId === 'minecartSwitchPlayBtn' &&
  named[0].image === 'assets/minecart-switch-card.png' &&
  named[0].status === 'playable' &&
  named[0].leaderboard === true
) {
  ok('1. current game registration');
} else bad('1. registration', named[0]);

if (fs.existsSync(path.join(root, 'app/assets/minecart-switch-card.png'))) {
  ok('1b. original card artwork file present');
} else bad('1b. missing card png');

if (
  gamesHtml.includes('id="minecartSwitchPlayBtn"') &&
  gamesHtml.includes('id="minecartSwitchArea"') &&
  gamesHtml.includes('lantern-minecart-switch.js') &&
  gamesHtml.includes('lantern-minecart-switch.css') &&
  gamesHtml.includes("tryPlay('Minecart Switch'")
) {
  ok('1c. games.html trigger + surface + script wired');
} else bad('1c. games.html wiring');

// 2. game id stable
if (
  ids.filter((id) => id === 'minecart-switch').length === 1 &&
  new Set(ids).size === ids.length &&
  serverGame &&
  serverGame.id === 'minecart-switch' &&
  serverGame.name === 'Minecart Switch' &&
  LANTERN_LEADERBOARD_GAMES.filter((g) => g.id === 'minecart-switch').length === 1 &&
  MCS.GAME_ID === 'minecart-switch'
) {
  ok('2. game id stable');
} else bad('2. game id', { ids, serverGame });

if (ids.includes('srp-safety-trivia') && gamesHtml.includes('id="srpSafetyTriviaPlayBtn"')) {
  ok('2b. SRP Safety Challenge preserved on current main');
} else bad('2b. SRP regression');

// 3. 1 Nugget paid run
if (
  named[0] &&
  named[0].play_cost === 1 &&
  paidStartJs.includes("kind: 'game_play'") &&
  paidStartJs.includes('return 1') &&
  /playCostForGame[\s\S]{0,400}return 1/.test(paidStartJs)
) {
  ok('3. 1 Nugget paid run');
} else bad('3. paid start cost');

// 4. #159 proof
if (
  paidProofJs.includes('evaluatePaidGamePlayRun') &&
  workerIndex.includes('findPaidGamePlayByRunId') &&
  workerIndex.includes("error: 'invalid_run'") &&
  minecartHost.includes('getLastRunId') &&
  /if \(!runId\) \{\s*\n\s*toast\('Score couldn\\'t be saved/.test(minecartHost) &&
  !minecartHost.includes('huntRunId')
) {
  ok('4. #159 paid-run proof used');
} else bad('4. #159 proof');

// 5. retry no duplicate debit
if (
  paidStartJs.includes('spendInFlight') &&
  paidStartJs.includes("error: 'in_flight'") &&
  paidStartJs.includes('run_id: runId') &&
  workerIndex.includes("indexOf('game_') === 0") &&
  contractDoc.includes('lantern:game_play:<run_id>')
) {
  ok('5. retry no duplicate debit');
} else bad('5. retry debit');

// 6. Play Again new debit/run
if (
  minecartHost.includes('onPlayAgain: startMinecartRound') &&
  minecartHost.includes("tryPlay('Minecart Switch'") &&
  minecartHost.includes('startPaidGame') === false &&
  gamesHtml.includes('LanternGamesPaidStart.startPaidGame') &&
  /function startMinecartRound\(\)\{\s*\n\s*tryPlay\('Minecart Switch'/.test(gamesHtml)
) {
  ok('6. Play Again uses new run/debit via tryPlay');
} else bad('6. Play Again');

// 7. canonical balance
if (
  gamesHtml.includes('LanternWallet.bindElement') &&
  paidStartJs.includes('refreshBalance({ force: true })') &&
  walletJs.includes('fetchMyBalance') &&
  !engineJs.includes('localStorage') &&
  !/minecart[\s\S]{0,80}wallet/i.test(engineJs) &&
  !engineJs.includes('available +=') &&
  !engineJs.includes('available -=')
) {
  ok('7. canonical #170 balance / no local wallet');
} else bad('7. canonical balance');

// 8. leaderboard run proof
if (
  gamesHtml.includes("postLeaderboardScore('Minecart Switch'") &&
  /function postLeaderboardScore[\s\S]{0,1800}run_id: resultRunId/.test(gamesHtml) &&
  /if \(gamesApiBase == null \|\| !key \|\| !Number\.isFinite\(numericScore\) \|\| !resultRunId\)/.test(gamesHtml)
) {
  ok('8. leaderboard run proof');
} else bad('8. leaderboard proof');

// 9. score comparator higher-is-better
if (
  named[0] &&
  named[0].scoring &&
  named[0].scoring.lowerIsBetter === false &&
  serverGame &&
  serverGame.lowerIsBetter === false &&
  isLowerIsBetterGame('minecart-switch') === false &&
  isLowerIsBetterGame('Minecart Switch') === false &&
  workerCatalog.includes("id: 'minecart-switch'") &&
  /id: 'minecart-switch'[\s\S]{0,180}lowerIsBetter: false/.test(workerCatalog)
) {
  ok('9. score comparator higher-is-better');
} else bad('9. comparator', serverGame);

if (serverGame && serverGame.scoreMin === 0 && serverGame.scoreMax === 15000 && MCS.SCORE_MIN === 0 && MCS.SCORE_MAX === 15000) {
  ok('9b. score bounds 0–15000');
} else bad('9b. score bounds', serverGame);

// 10–11. safe path / no impossible layouts
let allSafe = true;
let allReachable = true;
for (let seed = 1; seed <= 80; seed++) {
  const row = MCS.generatePattern({
    rng: MCS.createRng(seed * 17),
    distance: seed * 3,
    fromLanes: [1],
    reachable: { 0: false, 1: true, 2: false },
  });
  if (!MCS.maskHasSafeLane(row.mask) || !row.safeLanes.length) allSafe = false;
  const seq = MCS.generateSequence({
    rng: MCS.createRng(seed * 31),
    distance: 20 + seed * 2,
    fromLanes: [1],
  }, 8);
  if (!seq.every((r) => MCS.maskHasSafeLane(r.mask))) allSafe = false;
  if (!MCS.sequenceHasReachablePath(seq, 1)) allReachable = false;
}
if (allSafe) ok('10. safe path generation / obstacle always leaves a safe lane');
else bad('10. unsafe pattern generated');
if (allReachable) ok('11. no impossible deterministic layouts');
else bad('11. unreachable sequence');

const longSim = MCS.createSim({ seed: 99 });
for (let i = 0; i < 400; i++) longSim.step(32);
const longSafe = longSim.getState().obstacles.every((o) => MCS.maskHasSafeLane(o.mask));
if (longSafe) ok('11b. live-run spawned rows all have a safe lane');
else bad('11b. live-run unsafe row');

const s0 = MCS.currentSpeed(0);
const sMid = MCS.currentSpeed(80);
const sMax = MCS.currentSpeed(240);
const sOver = MCS.currentSpeed(900);
if (s0 < sMid && sMid < sMax && sMax === MCS.SPEED_MAX && sOver === MCS.SPEED_MAX) {
  ok('11c. speed rises and is capped (lane-switch timing remains bounded)');
} else bad('11c. speed', { s0, sMid, sMax, sOver });

// 12. life decrement
const sim0 = MCS.createSim({ seed: 7 });
if (MCS.STARTING_LIVES === 3 && sim0.snapshot().lives === 3 && sim0.snapshot().lane === MCS.LANE_CENTER) {
  ok('12a. 3 starting lives / center lane');
} else bad('12a. start state', sim0.snapshot());

function forceHit(sim, lane) {
  const st = sim.getState();
  st.obstacles.push({
    id: 'force_' + st.idSeq++,
    z: 1.35,
    mask: 1 << lane,
    type: 'rock',
    safeLanes: MCS.safeLanesFromMask(1 << lane),
    consumed: false,
    passed: false,
    nearMissAwarded: false,
  });
  const before = sim.snapshot().lives;
  sim.step(20);
  return { before, after: sim.snapshot().lives, ended: sim.snapshot().ended, invuln: sim.snapshot().invulnerable };
}

const hitSim = MCS.createSim({ seed: 11 });
const h1 = forceHit(hitSim, hitSim.snapshot().lane);
if (h1.before === 3 && h1.after === 2 && !h1.ended && h1.invuln) {
  ok('12. life decrement is deterministic (one life per collision)');
} else bad('12. collision life', h1);

const h1b = forceHit(hitSim, hitSim.snapshot().lane);
if (h1b.after === 2 && h1b.invuln) ok('12b. recovery prevents multi-hit');
else bad('12b. recovery', h1b);

hitSim.getState().invulnUntil = 0;
const h2 = forceHit(hitSim, hitSim.snapshot().lane);
hitSim.getState().invulnUntil = 0;
const h3 = forceHit(hitSim, hitSim.snapshot().lane);
if (h2.after === 1 && h3.after === 0 && h3.ended) ok('12c. zero lives ends run');
else bad('12c. game over', { h2, h3 });

if (MCS.clampLane(-4) === 0 && MCS.clampLane(9) === 2 && MCS.clampLane(1) === 1) {
  ok('12d. legal lane indexes only');
} else bad('12d. clampLane');

const leftEdge = MCS.createSim({ seed: 2 });
leftEdge.inputLeft();
leftEdge.step(200);
const leftAgain = leftEdge.inputLeft();
if (leftEdge.snapshot().lane === 0 && leftAgain === false) ok('12e. left from LEFT cannot leave range');
else bad('12e. left bound', leftEdge.snapshot());

const rightEdge = MCS.createSim({ seed: 3 });
rightEdge.inputRight();
rightEdge.step(200);
const rightAgain = rightEdge.inputRight();
if (rightEdge.snapshot().lane === 2 && rightAgain === false) ok('12f. right from RIGHT cannot leave range');
else bad('12f. right bound', rightEdge.snapshot());

const firstSubmit = hitSim.markSubmitted();
const secondSubmit = hitSim.markSubmitted();
if (firstSubmit === true && secondSubmit === false && hitSim.snapshot().resultSubmitted) {
  ok('12g. result submits once');
} else bad('12g. submit once', { firstSubmit, secondSubmit });

// 13. restart reset
if (
  engineJs.includes('host.sim = createSim') &&
  engineJs.includes('stopLoop') &&
  minecartHost.includes('scorePosted = false') &&
  minecartHost.includes('MCS.startRun()') &&
  minecartHost.includes('resetMinecartGame') &&
  minecartHost.includes('MCS.stopRun')
) {
  ok('13. restart reset (new sim + stop prior loop + clear scorePosted)');
} else bad('13. restart');

const fresh = MCS.createSim({ seed: 21 });
fresh.inputRight();
fresh.step(40);
const reset = MCS.createSim({ seed: 22 });
if (reset.snapshot().lives === 3 && reset.snapshot().score === 0 && reset.snapshot().lane === 1 && !reset.snapshot().ended) {
  ok('13b. new sim is a clean run');
} else bad('13b. new sim', reset.snapshot());

// 14. duplicate touch protection
if (
  engineJs.includes('inputLockUntil') &&
  engineJs.includes('if (now < inputLockUntil) return false') &&
  engineJs.includes("e.type === 'click' && gestureUsed") &&
  engineJs.includes('if (e.repeat) return') &&
  engineJs.includes('if (host.bound) return') &&
  minecartHost.includes('if (mounted || !MCS || !area) return')
) {
  ok('14. duplicate touch protection');
} else bad('14. duplicate touch');

if (engineJs.includes('touchstart') && engineJs.includes('touchend') && engineJs.includes('ArrowLeft') && engineJs.includes('keydown')) {
  ok('14b. swipe + keyboard handlers exist');
} else bad('14b. input handlers');

// 15. mobile overflow
if (
  css.includes('overflow-x: hidden') &&
  css.includes('flex-direction: column') &&
  css.includes('touch-action: none') &&
  css.includes('max-width: 100%') &&
  css.includes('min-width: 0') &&
  css.includes('.mcsOverActions') &&
  css.includes('flex-direction: column') &&
  css.includes('font-size: 22px') &&
  css.includes('font-size: 36px')
) {
  ok('15. mobile overflow / single-column / 22–36 type');
} else bad('15. mobile css');

// 16. timers cleaned on game end
if (
  engineJs.includes('cancelAnimationFrame') &&
  /if \(after\.ended\) \{[\s\S]{0,280}showGameOver\(\)/.test(engineJs) &&
  /if \(after\.ended\) \{[\s\S]{0,400}else \{[\s\S]{0,80}requestAnimationFrame\(loop\)/.test(engineJs) &&
  minecartHost.includes('MCS.stopRun') &&
  engineJs.includes('function unmount') &&
  engineJs.includes('stopLoop')
) {
  ok('16. timers cleaned on game end / exit');
} else bad('16. timers');

// 17. reward behavior matches explicit product contract (no invented game_win)
if (
  engineJs.includes('does not award game_win') &&
  !minecartHost.includes('awardGameWinWithEconomy') &&
  !minecartHost.includes("kind: 'game_win'") &&
  !engineJs.includes('awardGameWin') &&
  !triviaMissionsJs.includes('minecart-switch') &&
  !engineJs.includes('completeMission') &&
  !minecartHost.includes('LANTERN_EDU_TRIVIA.startRun')
) {
  ok('17. no game_win / no Mission completion (survival score only)');
} else bad('17. reward contract');

const over = MCS.computeScore({ distance: 999999, obstaclesPassed: 999999, nearMisses: 999999 });
const neg = MCS.computeScore({ distance: -10, obstaclesPassed: -4, nearMisses: -2 });
if (over === MCS.SCORE_MAX && neg === MCS.SCORE_MIN && !Number.isNaN(over)) {
  ok('17b. score clamp rejects overflow / negative');
} else bad('17b. score overflow', { over, neg });

// 18–20. current-main regressions still present as suites
if (proof159.includes('evaluatePaidGamePlayRun') && proof159.includes('minecart-switch')) {
  ok('18. #159 regression suite still enumerates current catalog including Minecart Switch');
} else bad('18. #159 suite');
if (economy169.includes('game_play costs exactly 1 Nugget') || fs.existsSync(path.join(root, 'docs/NUGGET_ECONOMY_CONTRACT.md'))) {
  ok('19. #169 economy contract still present');
} else bad('19. #169');
if (
  contractDoc.includes('Direct paid game start') &&
  /refreshBalance\(\{ force: true \}\)/.test(paidStartJs) &&
  balance170.includes('Canonical Nugget balance')
) {
  ok('20. #170 canonical balance contract still present');
} else bad('20. #170');

if (gamesPageJs.includes('leaderboardPublicLabel') && gamesPageJs.includes('public_display_name')) {
  ok('identity. canonical leaderboard public label unchanged');
} else bad('identity');

async function liveSecurity() {
  const cookie = await cookieFor(studentAccount());

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'mcs-run-1' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_id: 'minecart-switch',
      score: 240,
      score_display: '240 pts · 18m',
      run_id: 'mcs-run-1',
      character_name: 'someone_else',
    });
    if (r.status === 200 && r.json.ok && r.json.character_name === '20889' && state.entries[0] && state.entries[0].character_name === '20889') {
      ok('8b. live record uses session identity + paid-run proof');
    } else bad('8b. live identity', r);
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_id: 'minecart-switch',
      score: 240,
      score_display: '240 pts · 18m',
      run_id: 'mcs-missing-pay',
    });
    if (r.status === 400 && r.json.error === 'invalid_run' && state.entries.length === 0) {
      ok('4b. Minecart score without paid game_play is invalid_run');
    } else bad('4b. missing paid run', r);
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'mcs-run-dup' });
    const env = makeEnv(state);
    const body = { game_id: 'minecart-switch', score: 180, score_display: '180 pts', run_id: 'mcs-run-dup' };
    const a = await postRecord(env, cookie, body);
    const b = await postRecord(env, cookie, body);
    if (a.status === 200 && b.status === 200 && b.json.idempotent === true && state.entries.length === 1) {
      ok('8c. result idempotent on same run_id');
    } else bad('8c. idempotent', { a, b, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'mcs-neg' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_id: 'minecart-switch', score: -4, run_id: 'mcs-neg' });
    if (r.status === 400 && r.json.error === 'score_out_of_range' && state.entries.length === 0) {
      ok('9c. negative score rejected');
    } else bad('9c. negative', r);
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'mcs-nan' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_id: 'minecart-switch', score: 'NaN', run_id: 'mcs-nan' });
    if (r.status === 400 && r.json.error === 'malformed_score' && state.entries.length === 0) {
      ok('9d. NaN rejected');
    } else bad('9d. NaN', r);
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'mcs-abs' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_id: 'minecart-switch', score: 999999, run_id: 'mcs-abs' });
    if (r.status === 400 && r.json.error === 'score_out_of_range' && state.entries.length === 0) {
      ok('9e. absurd score rejected');
    } else bad('9e. absurd', r);
  }

  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'mcs-wrong' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_id: 'not-a-real-game', score: 10, run_id: 'mcs-wrong' });
    if (r.status === 400 && r.json.error === 'invalid_game' && state.entries.length === 0) {
      ok('2c. wrong game ID rejected');
    } else bad('2c. wrong id', r);
  }

  if (!validateLeaderboardScore(serverGame, Number.NaN).ok && !validateLeaderboardScore(serverGame, -1).ok && !validateLeaderboardScore(serverGame, 15001).ok) {
    ok('9f. unit bounds reject NaN / negative / above max');
  } else bad('9f. unit bounds');
}

await liveSecurity();

console.log('\nMinecart Switch tests (Prompt #175):', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
