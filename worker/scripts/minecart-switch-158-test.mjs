/**
 * Minecart Switch — Prompt #158 focused tests + current catalog/security regressions.
 * Usage: node worker/scripts/minecart-switch-158-test.mjs
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
    role: 'student',
    student_character_name: 'Lucas',
    teacher_id: null,
    mtss_student_id: '20889',
    staff_id: null,
    is_active: 1,
    must_change_password: 0,
  };
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
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
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

// 1. game ID unique
const ids = cat.listGames().map((g) => g.id);
if (ids.filter((id) => id === 'minecart-switch').length === 1 && new Set(ids).size === ids.length) {
  ok('1. game ID unique');
} else bad('1. game ID unique', ids.join(','));

// 2. card/catalog registered once
const named = cat.listGames().filter((g) => g.name === 'Minecart Switch');
if (named.length === 1 && named[0].image === 'assets/minecart-switch-card.png' && named[0].playBtnId === 'minecartSwitchPlayBtn') {
  ok('2. card/catalog registered once');
} else bad('2. catalog card', named[0]);

if (fs.existsSync(path.join(root, 'app/assets/minecart-switch-card.png'))) {
  ok('2b. original card artwork file present');
} else bad('2b. missing card png');

// 3. server allowlist
const serverGame = resolveRegisteredLeaderboardGame('minecart-switch');
if (serverGame && serverGame.name === 'Minecart Switch' && LANTERN_LEADERBOARD_GAMES.filter((g) => g.id === 'minecart-switch').length === 1) {
  ok('3. server allowlist includes minecart-switch');
} else bad('3. server allowlist', serverGame);

// 4. score bounds
if (serverGame && serverGame.scoreMin === 0 && serverGame.scoreMax === 15000 && MCS.SCORE_MIN === 0 && MCS.SCORE_MAX === 15000) {
  ok('4. score bounds registered');
} else bad('4. score bounds', serverGame);

// 5. valid start costs exactly 1 Nugget
if (named[0] && named[0].play_cost === 1 && gamesHtml.includes("tryPlay('Minecart Switch'") && paidStartJs.includes("kind: 'game_play'")) {
  ok('5. valid start costs exactly 1 Nugget');
} else bad('5. paid start cost');

// 6. server derives identity
if (gamesHtml.includes("postLeaderboardScore('Minecart Switch'") && !/postLeaderboardScore\('Minecart Switch'[\s\S]{0,200}character_name\s*:/.test(gamesHtml)) {
  ok('6. server derives identity (client post omits authoritative identity fields)');
} else bad('6. identity');

// 7. run_id required
if (gamesHtml.includes("getLastRunId") && /if \(!runId\) \{\s*\n\s*toast\('Score couldn\\'t be saved/.test(gamesHtml)) {
  ok('7. run_id required before Minecart result post');
} else bad('7. run_id required');

// 8–12 exercised live below; source contract first
if (workerCatalog.includes("id: 'minecart-switch'") && workerCatalog.includes('scoreMax: 15000')) {
  ok('4b. worker catalog scoreMax 15000');
} else bad('4b. worker catalog bounds');

// 13. 3 starting lives
const sim0 = MCS.createSim({ seed: 7 });
if (MCS.STARTING_LIVES === 3 && sim0.snapshot().lives === 3 && sim0.snapshot().lane === MCS.LANE_CENTER) {
  ok('13. 3 starting lives / center lane');
} else bad('13. start state', sim0.snapshot());

// 14–16. legal lanes only
if (MCS.clampLane(-4) === 0 && MCS.clampLane(9) === 2 && MCS.clampLane(1) === 1) {
  ok('14. legal lane indexes only');
} else bad('14. clampLane');

const leftEdge = MCS.createSim({ seed: 2 });
leftEdge.inputLeft();
leftEdge.step(200);
const leftAgain = leftEdge.inputLeft();
if (leftEdge.snapshot().lane === 0 && leftAgain === false) {
  ok('15. left from LEFT cannot go outside range');
} else bad('15. left bound', leftEdge.snapshot());

const rightEdge = MCS.createSim({ seed: 3 });
rightEdge.inputRight();
rightEdge.step(200);
const rightAgain = rightEdge.inputRight();
if (rightEdge.snapshot().lane === 2 && rightAgain === false) {
  ok('16. right from RIGHT cannot go outside range');
} else bad('16. right bound', rightEdge.snapshot());

// 17–19 collision / recovery / zero lives
function forceHit(sim, lane) {
  const st = sim.getState();
  st.obstacles.push({
    id: 'force_' + st.idSeq++,
    z: MCS.createSim({ seed: 1 }).getState ? 1.35 : 1.35,
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
  ok('17. collision removes one life only');
} else bad('17. collision life', h1);

const h1b = forceHit(hitSim, hitSim.snapshot().lane);
if (h1b.after === 2 && h1b.invuln) {
  ok('18. recovery prevents multi-hit');
} else bad('18. recovery', h1b);

hitSim.getState().invulnUntil = 0;
const h2 = forceHit(hitSim, hitSim.snapshot().lane);
hitSim.getState().invulnUntil = 0;
const h3 = forceHit(hitSim, hitSim.snapshot().lane);
if (h2.after === 1 && h3.after === 0 && h3.ended) {
  ok('19. zero lives ends run');
} else bad('19. game over', { h2, h3 });

// 20. result submits once
const firstSubmit = hitSim.markSubmitted();
const secondSubmit = hitSim.markSubmitted();
if (firstSubmit === true && secondSubmit === false && hitSim.snapshot().resultSubmitted) {
  ok('20. result submits once');
} else bad('20. submit once', { firstSubmit, secondSubmit });

// 21–22 obstacle fairness
let allSafe = true;
let allReachable = true;
for (let seed = 1; seed <= 80; seed++) {
  const rng = MCS.createRng(seed * 17);
  const ctx = { rng: rng, distance: seed * 3, fromLanes: [1], reachable: { 0: false, 1: true, 2: false } };
  const row = MCS.generatePattern(ctx);
  if (!MCS.maskHasSafeLane(row.mask) || !row.safeLanes.length) allSafe = false;
  const seq = MCS.generateSequence({
    rng: MCS.createRng(seed * 31),
    distance: 20 + seed * 2,
    fromLanes: [1],
  }, 8);
  if (!seq.every((r) => MCS.maskHasSafeLane(r.mask))) allSafe = false;
  if (!MCS.sequenceHasReachablePath(seq, 1)) allReachable = false;
}
if (allSafe) ok('21. obstacle always leaves safe lane');
else bad('21. unsafe pattern generated');
if (allReachable) ok('22. generated sequence has reachable safe path');
else bad('22. unreachable sequence');

// live sim generation also stays legal
const longSim = MCS.createSim({ seed: 99 });
for (let i = 0; i < 400; i++) longSim.step(32);
const spawned = longSim.getState().obstacles.concat();
const longSafe = spawned.every((o) => MCS.maskHasSafeLane(o.mask));
if (longSafe) ok('21b. live-run spawned rows all have a safe lane');
else bad('21b. live-run unsafe row');

// 23–24 speed curve
const s0 = MCS.currentSpeed(0);
const sMid = MCS.currentSpeed(80);
const sMax = MCS.currentSpeed(240);
const sOver = MCS.currentSpeed(900);
if (s0 < sMid && sMid < sMax && sMax === MCS.SPEED_MAX && sOver === MCS.SPEED_MAX) {
  ok('23. speed rises gradually');
  ok('24. speed has max bound');
} else bad('23/24 speed', { s0, sMid, sMax, sOver });

// 25–27 input
if (engineJs.includes('touchstart') && engineJs.includes('touchend') && /dx < 0/.test(engineJs)) {
  ok('25. touch/swipe handler exists');
} else bad('25. swipe');
if (engineJs.includes('ArrowLeft') && engineJs.includes('ArrowRight') && engineJs.includes('keydown')) {
  ok('26. keyboard handler exists');
} else bad('26. keyboard');
if (engineJs.includes('if (host.bound) return') && gamesHtml.includes('if (mounted || !MCS || !area) return') && gamesHtml.includes('MCS.startRun()')) {
  ok('27. no duplicate listener after restart');
} else bad('27. listener restart');

// 28. no Mission completion during direct game
const minecartHost = gamesHtml.slice(gamesHtml.indexOf('Minecart Switch: paid start'), gamesHtml.indexOf('Minecart Switch: paid start') + 3500);
if (
  !engineJs.includes('completeMission') &&
  !engineJs.includes('LANTERN_EDU_TRIVIA') &&
  !minecartHost.includes('LANTERN_EDU_TRIVIA.startRun') &&
  !minecartHost.includes('submitAnswer') &&
  !minecartHost.includes('completeMission') &&
  !triviaMissionsJs.includes('minecart-switch')
) {
  ok('28. no Mission completion during direct game');
} else bad('28. mission leak');

// 29. canonical leaderboard identity
if (gamesPageJs.includes('leaderboardPublicLabel') && gamesPageJs.includes('public_display_name') && !gamesPageJs.includes('First L.')) {
  ok('29. canonical leaderboard identity');
} else bad('29. leaderboard identity');

// 30. no local wallet implementation
if (
  !engineJs.includes('localStorage') &&
  !/minecart[\s\S]{0,80}wallet/i.test(engineJs) &&
  walletJs.includes('fetchMyBalance') &&
  paidStartJs.includes('postEconomyTransact')
) {
  ok('30. no local wallet implementation');
} else bad('30. local wallet');

// extra playability / a11y / mobile source contracts
if (css.includes('touch-action: none') && css.includes('overflow-x: hidden') && css.includes('flex-direction: column')) {
  ok('mobile-first single-column / no horizontal overflow / swipe lock');
} else bad('mobile css');
if (css.includes('font-size: 22px') && css.includes('font-size: 36px')) {
  ok('HUD/game-over type in 22–36 range');
} else bad('font size');
if (engineJs.includes('requestAnimationFrame') && engineJs.includes('MAX_DT_MS') && engineJs.includes('Math.min(dt, MAX_DT_MS)')) {
  ok('rAF + clamped delta time');
} else bad('timing');
if (gamesHtml.includes('id="minecartSwitchPlayBtn"') && gamesHtml.includes('id="minecartSwitchArea"') && gamesHtml.includes('lantern-minecart-switch.js')) {
  ok('games.html trigger + surface + script wired');
} else bad('games.html wiring');
if (computeOverflow()) {
  ok('score clamp rejects overflow');
} else bad('score overflow');

function computeOverflow() {
  const over = MCS.computeScore({ distance: 999999, obstaclesPassed: 999999, nearMisses: 999999 });
  const neg = MCS.computeScore({ distance: -10, obstaclesPassed: -4, nearMisses: -2 });
  return over === MCS.SCORE_MAX && neg === MCS.SCORE_MIN && !Number.isNaN(over);
}

async function liveSecurity() {
  const envBase = () => {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    return { state, env: makeEnv(state) };
  };
  const cookie = await cookieFor(studentAccount());

  {
    const { state, env } = envBase();
    const r = await postRecord(env, cookie, {
      game_id: 'minecart-switch',
      score: 240,
      score_display: '240 pts · 18m',
      run_id: 'mcs-run-1',
      character_name: 'someone_else',
    });
    if (r.status === 200 && r.json.ok && r.json.character_name === '20889' && state.entries[0] && state.entries[0].character_name === '20889') {
      ok('6b. live record uses session identity, ignores client name');
    } else bad('6b. live identity', r);
  }

  {
    const { state, env } = envBase();
    const body = { game_id: 'minecart-switch', score: 180, score_display: '180 pts', run_id: 'mcs-run-dup' };
    const a = await postRecord(env, cookie, body);
    const b = await postRecord(env, cookie, body);
    if (a.status === 200 && b.status === 200 && b.json.idempotent === true && state.entries.length === 1) {
      ok('8. result idempotent');
    } else bad('8. idempotent', { a, b, n: state.entries.length });
  }

  {
    const { state, env } = envBase();
    const r = await postRecord(env, cookie, { game_id: 'minecart-switch', score: -4, run_id: 'mcs-neg' });
    if (r.status === 400 && r.json.error === 'score_out_of_range' && state.entries.length === 0) {
      ok('9. negative score rejected');
    } else bad('9. negative', r);
  }

  {
    const { state, env } = envBase();
    const r = await postRecord(env, cookie, { game_id: 'minecart-switch', score: 'NaN', run_id: 'mcs-nan' });
    if (r.status === 400 && r.json.error === 'malformed_score' && state.entries.length === 0) {
      ok('10. NaN rejected');
    } else bad('10. NaN', r);
  }

  {
    const { state, env } = envBase();
    const r = await postRecord(env, cookie, { game_id: 'minecart-switch', score: 999999, run_id: 'mcs-abs' });
    if (r.status === 400 && r.json.error === 'score_out_of_range' && state.entries.length === 0) {
      ok('11. absurd score rejected');
    } else bad('11. absurd', r);
  }

  {
    const { state, env } = envBase();
    const r = await postRecord(env, cookie, { game_id: 'not-a-real-game', score: 10, run_id: 'mcs-wrong' });
    if (r.status === 400 && r.json.error === 'invalid_game' && state.entries.length === 0) {
      ok('12. wrong game ID rejected');
    } else bad('12. wrong id', r);
  }

  if (!validateLeaderboardScore(serverGame, Number.NaN).ok && !validateLeaderboardScore(serverGame, -1).ok && !validateLeaderboardScore(serverGame, 15001).ok) {
    ok('11b. unit bounds reject NaN / negative / above max');
  } else bad('11b. unit bounds');
}

await liveSecurity();

console.log('\nMinecart Switch tests (Prompt #158):', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
