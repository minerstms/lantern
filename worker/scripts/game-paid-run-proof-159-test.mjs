/**
 * Prompt #159 — leaderboard scores must bind to a successful paid game_play run.
 * Usage: node worker/scripts/game-paid-run-proof-159-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  validateLeaderboardScore,
} from '../lantern-game-catalog.js';
import {
  PAID_RUN_RESULT_WINDOW_MS,
  evaluatePaidGamePlayRun,
  paidRunGameMatches,
} from '../game-paid-run-proof.js';
import { EDUCATIONAL_TRIVIA_REWARD_NUGGETS } from '../educational-trivia-missions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

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

function otherStudent() {
  return studentAccount({
    username: '20999',
    display_name: 'Riley',
    public_display_name: 'Riley',
    student_character_name: 'Riley',
    mtss_student_id: '20999',
  });
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
          return { results: state.entries.slice() };
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
  const json = await res.json();
  return { status: res.status, json };
}

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const eduSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const clientEdu = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');

const reaction = resolveRegisteredLeaderboardGame('reaction');
const memory = resolveRegisteredLeaderboardGame('memory');
const hunt = resolveRegisteredLeaderboardGame('nuggetHunt');

if (PAID_RUN_RESULT_WINDOW_MS === 60 * 60 * 1000) ok('result window is 60 minutes');
else bad('result window', PAID_RUN_RESULT_WINDOW_MS);

if (reaction.scoreMin === 1 && !validateLeaderboardScore(reaction, 0).ok && validateLeaderboardScore(reaction, 1).ok) {
  ok('23/24. Reaction 0 ms rejected; 1 ms accepted');
} else bad('Reaction bounds');

if (memory.scoreMin === 1 && !validateLeaderboardScore(memory, 0).ok && validateLeaderboardScore(memory, 1).ok) {
  ok('23/24. Memory 0 s rejected; 1 s accepted');
} else bad('Memory bounds');

if (hunt.scoreMin === 0 && validateLeaderboardScore(hunt, 0).ok) {
  ok('Nugget Hunt keeps 0 — timer can report 0 before first tick');
} else bad('Nugget Hunt 0 still legitimate');

const catalogIds = LANTERN_LEADERBOARD_GAMES.map((g) => g.id).sort();
const expectedIds = ['avatar-match', 'clickrush', 'handbook-trivia', 'lantern-live-trivia', 'local-history-trivia', 'memory', 'minecart-switch', 'nuggetHunt', 'reaction', 'srp-safety-trivia'];
if (catalogIds.join() === expectedIds.sort().join()) ok('33. all ten catalog games remain the production set');
else bad('catalog ids', catalogIds);

if (
  workerIndex.includes('findPaidGamePlayByRunId') &&
  workerIndex.includes('evaluatePaidGamePlayRun') &&
  workerIndex.includes("error: 'invalid_run'")
) {
  ok('Worker record path requires paid-run proof');
} else bad('Worker proof wiring');

if (paidStartJs.includes('game_id:') && paidStartJs.includes('clearLastRunId')) {
  ok('paid start persists game_id and can clear the run token');
} else bad('paid start contract');

if (playerJs.includes('clearLastRunId')) ok('Game Player exit clears the paid-run token');
else bad('player exit clear');

const postFn = gamesHtml.slice(gamesHtml.indexOf('function postLeaderboardScore'), gamesHtml.indexOf('function postLeaderboardScore') + 2200);
if (
  postFn.includes('getLastRunId') &&
  postFn.includes('run_id: resultRunId') &&
  !postFn.includes('runId ||') &&
  gamesHtml.includes("postLeaderboardScore('Nugget Hunt'") &&
  !gamesHtml.includes("postLeaderboardScore('Nugget Hunt', adopted.name, completionTimeSec, completionTimeSec + 's', function(){}, huntRunId)")
) {
  ok('30. Nugget Hunt leaderboard uses paid getLastRunId, not hunt UUID');
} else bad('Nugget Hunt leaderboard run');

if (gamesHtml.includes('awardGameWinWithEconomy') && gamesHtml.includes('huntRunId')) {
  ok('31. Nugget Hunt game_win still uses its own hunt UUID');
} else bad('Nugget Hunt game_win');

if (
  !eduSrc.includes('/api/leaderboards/record') &&
  !clientEdu.includes('/api/leaderboards/record') &&
  EDUCATIONAL_TRIVIA_REWARD_NUGGETS === 1 &&
  eduSrc.includes('completeMissionByEvent')
) {
  ok('27/28. trivia Mission completion stays off the leaderboard path; reward remains +1');
} else bad('trivia mission isolation');

if (
  workerIndex.includes('ensureFirstGameMissionCompletion') &&
  workerIndex.indexOf('ensureFirstGameMissionCompletion') < workerIndex.indexOf("path === '/api/leaderboards/record'")
) {
  ok('29. First Game Played remains tied to game_play, not leaderboard record');
} else bad('First Game hook location');

if (
  gamesHtml.includes('startReactionRound') &&
  gamesHtml.includes("playAgainBtn.addEventListener('click', startReactionRound)") &&
  gamesHtml.includes('tryPlay')
) {
  ok('Play Again re-enters tryPlay (new paid run)');
} else bad('Play Again');

async function main() {
  const me = studentAccount();
  const other = otherStudent();
  const cookie = await cookieFor(me);
  const otherCookie = await cookieFor(other);

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Nugget Click Rush', gameId: 'clickrush', runId: 'run-valid-1' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_id: 'clickrush', score: 40, score_display: '40 taps', run_id: 'run-valid-1' });
    if (r.status === 200 && r.json.ok && state.entries.length === 1 && state.entries[0].character_name === '20889') {
      ok('1/11. valid paid run + valid score succeeds');
    } else bad('1 valid paid run', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Nugget Click Rush', gameId: 'clickrush', runId: 'run-valid-2' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Nugget Click Rush', score: 12, score_display: '12 taps' });
    if (r.status === 400 && r.json.error === 'invalid_run' && state.entries.length === 0) ok('2. missing run_id fails');
    else bad('2 missing run_id', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Nugget Click Rush', score: 12, run_id: 'bad run;drop' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('3. malformed run_id fails');
    else bad('3 malformed', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Nugget Click Rush', score: 12, run_id: 'run-unknown' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('4. unknown run_id fails');
    else bad('4 unknown', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Reaction Tap', score: 200, run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('5. fabricated UUID fails');
    else bad('5 fabricated', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: 70, run_id: 'session-only' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('6. valid session without paid run fails');
    else bad('6 session only', r);
  }

  {
    const state = { accounts: { '20889': me, '20999': other } };
    addPaidRun(state, { characterName: '20999', gameName: 'Reaction Tap', gameId: 'reaction', runId: 'run-other' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Reaction Tap', score: 180, run_id: 'run-other' });
    if (r.status === 400 && r.json.error === 'invalid_run' && !String(JSON.stringify(r.json)).includes('20999')) {
      ok('7. another user run fails with generic invalid_run');
    } else bad('7 other user', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Reaction Tap', gameId: 'reaction', runId: 'run-reaction' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Nugget Click Rush', score: 20, run_id: 'run-reaction' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('8. valid run for wrong game fails');
    else bad('8 wrong game', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Nugget Hunt', gameId: 'nuggetHunt', runId: 'run-win', kind: 'game_win', delta: 1 });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Nugget Hunt', score: 8, run_id: 'run-win' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('9. non-game_play transaction cannot score');
    else bad('9 non game_play', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Memory Match', gameId: 'memory', runId: 'run-bad-delta', delta: 0 });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Memory Match', score: 12, run_id: 'run-bad-delta' });
    if (r.status === 400 && r.json.error === 'invalid_run') ok('10. failed/invalid transaction cannot score');
    else bad('10 invalid tx', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Avatar Match', gameId: 'avatar-match', runId: 'run-avatar' });
    const env = makeEnv(state);
    const first = await postRecord(env, cookie, { game_name: 'Avatar Match', score: 80, run_id: 'run-avatar' });
    const second = await postRecord(env, cookie, { game_name: 'Avatar Match', score: 99, run_id: 'run-avatar' });
    if (
      first.status === 200 &&
      second.status === 200 &&
      second.json.idempotent === true &&
      state.entries.length === 1 &&
      state.entries[0].score === 80
    ) {
      ok('12/13. duplicate result cannot insert twice; retry is idempotent');
    } else bad('12/13 idempotent', { first, second, n: state.entries.length });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, {
      characterName: '20889',
      gameName: 'Reaction Tap',
      gameId: 'reaction',
      runId: 'run-old',
      createdAt: new Date(Date.now() - PAID_RUN_RESULT_WINDOW_MS - 5000).toISOString(),
    });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Reaction Tap', score: 200, run_id: 'run-old' });
    if (r.status === 400 && r.json.error === 'run_expired') ok('14. expired run fails');
    else bad('14 expired', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, {
      characterName: '20889',
      gameName: 'Reaction Tap',
      gameId: 'reaction',
      runId: 'run-fresh',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Reaction Tap', score: 200, run_id: 'run-fresh' });
    if (r.status === 200 && r.json.ok) ok('15. current run within window succeeds');
    else bad('15 within window', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Handbook Trivia', gameId: 'handbook-trivia', runId: 'run-hb' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, {
      game_name: 'Handbook Trivia',
      score: 70,
      run_id: 'run-hb',
      character_name: 'someone_else',
      username: 'hacker',
      public_display_name: 'Coach Colorado',
    });
    if (r.status === 200 && r.json.character_name === '20889' && state.entries[0].character_name === '20889') {
      ok('16/17/18. client identity fields cannot alter owner');
    } else bad('16-18 identity override', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Stack Lab', score: 10, run_id: 'run-x' });
    if (r.status === 400 && r.json.error === 'invalid_game') ok('19/34. invalid / unregistered Stack Lab fails');
    else bad('19 invalid game', r);
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Handbook Trivia', gameId: 'handbook-trivia', runId: 'run-nan' });
    const env = makeEnv(state);
    const a = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: 'NaN', run_id: 'run-nan' });
    const b = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: -3, run_id: 'run-nan' });
    const c = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: 101, run_id: 'run-nan' });
    if (a.status === 400 && a.json.error === 'malformed_score' && b.status === 400 && c.status === 400 && c.json.error === 'score_out_of_range') {
      ok('20/21/22. NaN / negative / above max fail');
    } else bad('20-22 score format', { a, b, c });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Handbook Trivia', gameId: 'handbook-trivia', runId: 'run-hb-direct' });
    addPaidRun(state, { characterName: '20889', gameName: 'Local History Trivia', gameId: 'local-history-trivia', runId: 'run-tr-direct' });
    const env = makeEnv(state);
    const hb = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: 80, run_id: 'run-hb-direct' });
    const tr = await postRecord(env, cookie, { game_name: 'Local History Trivia', score: 90, run_id: 'run-tr-direct' });
    if (hb.status === 200 && tr.status === 200) ok('25/26. Handbook and Trinidad direct leaderboard runs require paid proof and succeed with it');
    else bad('25/26 trivia leaderboard', { hb, tr });
  }

  {
    const state = { accounts: { '20889': me } };
    addPaidRun(state, { characterName: '20889', gameName: 'Minecart Switch', gameId: 'minecart-switch', runId: 'run-mine' });
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Minecart Switch', score: 5, run_id: 'run-mine' });
    if (r.status === 200 && r.json.ok && r.json.game_name === 'Minecart Switch') {
      ok('35. registered Minecart Switch records with paid-run proof');
    } else bad('35 minecart', r);
  }

  {
    const state = { accounts: { '20889': me } };
    const env = makeEnv(state);
    const r = await postRecord(env, cookie, { game_name: 'Minecart Switch', score: 5, run_id: 'run-mine-unpaid' });
    if (r.status === 400 && r.json.error === 'invalid_run') {
      ok('35b. Minecart Switch without paid run is invalid_run, not a free submit');
    } else bad('35b minecart unpaid', r);
  }

  {
    const reactionGame = resolveRegisteredLeaderboardGame('reaction');
    const clickGame = resolveRegisteredLeaderboardGame('clickrush');
    const tx = {
      character_name: '20889',
      delta: -1,
      kind: 'game_play',
      note: 'Reaction Tap',
      created_at: new Date().toISOString(),
      meta_json: JSON.stringify({ game_name: 'Reaction Tap', game_id: 'reaction', run_id: 'r1' }),
    };
    if (paidRunGameMatches(tx, reactionGame) && !paidRunGameMatches(tx, clickGame)) {
      ok('game binding is exact catalog id/name, not fuzzy');
    } else bad('exact game match');
    const proof = evaluatePaidGamePlayRun(tx, { characterName: 'hacker', game: reactionGame, nowMs: Date.now() });
    if (!proof.ok && proof.error === 'invalid_run') ok('evaluate rejects foreign account without leaking');
    else bad('evaluate owner', proof);
  }

  for (const g of LANTERN_LEADERBOARD_GAMES) {
    const state = { accounts: { '20889': me } };
    const runId = 'run-all-' + g.id;
    addPaidRun(state, { characterName: '20889', gameName: g.name, gameId: g.id, runId });
    const env = makeEnv(state);
    const score = g.lowerIsBetter ? Math.max(g.scoreMin, 1) : 10;
    const r = await postRecord(env, cookie, { game_id: g.id, score, run_id: runId });
    if (r.status === 200 && r.json.ok && r.json.game_name === g.name) ok('33. paid-run binding: ' + g.id);
    else bad('33 binding ' + g.id, r);
  }

  console.log('\nPaid-run proof #159:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
