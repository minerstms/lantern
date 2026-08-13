/**
 * Leaderboard record security — Prompt #128.
 *
 * POST /api/leaderboards/record previously trusted client character_name / game_name / score
 * with no Lantern session. This exercises the real worker/index.js fetch() entry point.
 *
 * Usage: node worker/scripts/leaderboard-record-security-test.mjs
 */
import worker from '../index.js';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  leaderboardGameNames,
  validateLeaderboardScore,
  sanitizeScoreDisplay,
  sanitizeRunId,
} from '../lantern-game-catalog.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function staffAccount(overrides) {
  return {
    username: 'rradle',
    display_name: 'Rick Radle',
    role: 'teacher',
    student_character_name: null,
    teacher_id: 'T1',
    mtss_student_id: null,
    staff_id: 4,
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}

function addPaidRun(state, opts) {
  state.transactions = state.transactions || [];
  const gameName = opts.gameName;
  const runId = opts.runId;
  state.transactions.push({
    id: opts.id || ('tx-' + runId),
    character_name: opts.characterName,
    delta: opts.delta != null ? opts.delta : -1,
    kind: opts.kind || 'game_play',
    source: 'GAME',
    note: opts.note != null ? opts.note : gameName,
    created_at: opts.createdAt || new Date().toISOString(),
    meta_json: JSON.stringify({
      game_name: gameName,
      game_id: opts.gameId || '',
      run_id: runId,
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
          let rows = state.entries.slice();
          if (s.includes('WHERE game_name = ?')) {
            rows = rows.filter((e) => e.game_name === binds[0]);
          } else if (s.includes('WHERE game_name IN')) {
            const inCount = (s.match(/\?/g) || []).length - (s.includes('created_at') ? (s.includes('created_at <=') ? 3 : 2) : 1);
            const names = binds.slice(0, Math.max(0, binds.length - 1));
            rows = rows.filter((e) => names.indexOf(e.game_name) !== -1);
          }
          return { results: rows };
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

async function getLeaderboards(env, query) {
  const req = new Request('https://lantern.example/api/leaderboards' + (query || ''), { method: 'GET' });
  const res = await worker.fetch(req, env);
  const json = await res.json();
  return { status: res.status, json };
}

async function postTransact(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const req = new Request('https://lantern.example/api/economy/transact', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Catalog unit checks
// ---------------------------------------------------------------------------
if (LANTERN_LEADERBOARD_GAMES.length === 9) ok('server catalog has nine production games');
else bad('server catalog count', LANTERN_LEADERBOARD_GAMES.length);

const expectedNames = [
  'Avatar Match',
  'Lantern Live Trivia',
  'Handbook Trivia',
  'Local History Trivia',
  'SRP Safety Challenge',
  'Reaction Tap',
  'Nugget Click Rush',
  'Memory Match',
  'Nugget Hunt',
  'Minecart Switch',
];
expectedNames.forEach((name) => {
  const g = resolveRegisteredLeaderboardGame(name);
  if (g && g.name === name && g.leaderboard && g.status === 'playable') ok('registered: ' + name);
  else bad('missing registered game', name);
});

if (resolveRegisteredLeaderboardGame('clickrush') && resolveRegisteredLeaderboardGame('clickrush').name === 'Nugget Click Rush') {
  ok('game id clickrush resolves to canonical display name');
} else bad('id resolution');

if (!resolveRegisteredLeaderboardGame('tower') && !resolveRegisteredLeaderboardGame('Tower')) {
  ok('Tower is not registered until explicitly added to the server catalog');
} else bad('Tower should not be in production catalog yet');

if (!resolveRegisteredLeaderboardGame('lab-game') && !resolveRegisteredLeaderboardGame('<script>')) {
  ok('arbitrary / injection game names are not registered');
} else bad('arbitrary game accepted');

const trivia = resolveRegisteredLeaderboardGame('Handbook Trivia');
if (validateLeaderboardScore(trivia, 80).ok && validateLeaderboardScore(trivia, 80).score === 80) {
  ok('legitimate trivia score accepted');
} else bad('legitimate trivia score');

if (!validateLeaderboardScore(trivia, 101).ok && validateLeaderboardScore(trivia, 101).error === 'score_out_of_range') {
  ok('trivia score above game ceiling rejected');
} else bad('trivia ceiling');

if (!validateLeaderboardScore(trivia, 'NaN').ok && !validateLeaderboardScore(trivia, Infinity).ok && !validateLeaderboardScore(trivia, null).ok) {
  ok('malformed scores rejected');
} else bad('malformed score unit');

if (sanitizeScoreDisplay('<img src=x onerror=alert(1)> 12 pts', 12) === 'img src=x onerror=alert(1) 12 pts') {
  ok('score_display strips HTML metacharacters');
} else bad('score_display sanitize', sanitizeScoreDisplay('<img src=x onerror=alert(1)> 12 pts', 12));

if (sanitizeScoreDisplay('12\u0000 pts<script>', 12).indexOf('<') === -1 && sanitizeScoreDisplay('12\u0000 pts<script>', 12).indexOf('\u0000') === -1) {
  ok('score_display strips control chars and remaining tags');
} else bad('score_display control/tag');

if (sanitizeRunId('run_abc-123') === 'run_abc-123' && sanitizeRunId('bad run;drop') === '' && sanitizeRunId('') === '') {
  ok('run_id sanitizer allows uuid-like tokens only');
} else bad('run_id sanitize');

if (leaderboardGameNames().length === 9) ok('production leaderboard name list is the nine catalog games');
else bad('leaderboardGameNames', leaderboardGameNames());

// ---------------------------------------------------------------------------
// Client contract: catalog games post without client-authoritative character_name
// ---------------------------------------------------------------------------
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const frontendCatalog = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');

const postFnStart = gamesHtml.indexOf('function postLeaderboardScore');
const postFnBlock = postFnStart === -1 ? '' : gamesHtml.slice(postFnStart, postFnStart + 2800);
if (postFnBlock.includes('game_name: key') && postFnBlock.includes('run_id: resultRunId') && !/character_name\s*:/.test(postFnBlock)) {
  ok('postLeaderboardScore no longer sends client character_name; always sends paid run_id');
} else bad('client record payload still identity-authoritative');

expectedNames.forEach((name) => {
  if (name === 'Lantern Live Trivia' || name === 'Handbook Trivia' || name === 'Local History Trivia' || name === 'SRP Safety Challenge') {
    if (gamesHtml.includes('postLeaderboardScore(gameName,')) ok('trivia client still posts via gameName: ' + name);
    else bad('trivia post missing', name);
  } else if (gamesHtml.includes("postLeaderboardScore('" + name + "'")) {
    ok('client still posts completion for ' + name);
  } else bad('client post missing', name);
});

if (paidStartJs.includes('getLastRunId') && paidStartJs.includes('run_id: runId')) {
  ok('paid-start exposes run_id for leaderboard idempotency');
} else bad('paid-start run_id');

if (workerIndex.includes('resolveEconomyGamePlayTransact') && workerIndex.includes("kindEarly === 'game_play' || kindEarly === 'game_win'")) {
  ok('game_play and game_win both use session-derived identity');
} else bad('game_win session identity hook');

if (workerIndex.includes('ensureFirstGameMissionCompletion')) {
  ok('First Game mission hook on game_play remains');
} else bad('first game hook');

expectedNames.forEach((name) => {
  if (frontendCatalog.includes("name: '" + name + "'")) ok('frontend catalog still lists ' + name);
  else bad('frontend catalog missing', name);
});

// ---------------------------------------------------------------------------
// Live Worker route tests
// ---------------------------------------------------------------------------
async function main() {
  // A. unauthenticated
  {
    const env = makeEnv({ entries: [] });
    const r = await postRecord(env, null, { game_name: 'Nugget Click Rush', character_name: 'Lucas', score: 40 });
    if (r.status === 401 && r.json.error === 'not_authenticated') {
      ok('A. unauthenticated leaderboard record rejected (401)');
    } else bad('A. unauthenticated', { status: r.status, json: r.json });
  }

  // B. spoofed character_name ignored
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Nugget Click Rush', gameId: 'clickrush', runId: 'run_click_b' });
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postRecord(env, cookie, {
      game_name: 'Nugget Click Rush',
      character_name: 'someone_else',
      score: 42,
      score_display: '42 taps',
      run_id: 'run_click_b',
    });
    const row = state.entries[0];
    if (status === 200 && json.ok && row && row.character_name === '20889' && json.character_name === '20889') {
      ok('B. spoofed character_name ignored; session identity 20889 recorded');
    } else bad('B. spoof identity', { status, json, row });
  }

  // C. legitimate current game
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Reaction Tap', gameId: 'reaction', runId: 'run_legit_1' });
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postRecord(env, cookie, {
      game_id: 'reaction',
      score: 248,
      score_display: '248 ms',
      run_id: 'run_legit_1',
    });
    if (status === 200 && json.ok && json.game_name === 'Reaction Tap' && state.entries[0] && state.entries[0].score === 248) {
      ok('C. authenticated legitimate game records successfully (id or name)');
    } else bad('C. legitimate', { status, json, entries: state.entries });
  }

  // D. invalid game ID
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postRecord(env, cookie, { game_name: 'Tower', score: 999 });
    if (status === 400 && json.error === 'invalid_game' && state.entries.length === 0) {
      ok('D. unregistered game ID (Tower) rejected');
    } else bad('D. invalid game', { status, json, n: state.entries.length });
  }

  // E. malformed score
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const a = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: 'nope' });
    const b = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: Infinity });
    const c = await postRecord(env, cookie, { game_name: 'Handbook Trivia' });
    if (a.status === 400 && a.json.error === 'malformed_score' && b.status === 400 && c.status === 400 && state.entries.length === 0) {
      ok('E. malformed / missing scores rejected');
    } else bad('E. malformed score', { a, b, c, n: state.entries.length });
  }

  // F. score_display injection
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Avatar Match', gameId: 'avatar-match', runId: 'run_avatar_f' });
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postRecord(env, cookie, {
      game_name: 'Avatar Match',
      score: 80,
      score_display: '<script>alert(1)</script>80 pts',
      run_id: 'run_avatar_f',
    });
    const row = state.entries[0];
    if (status === 200 && json.ok && row && String(row.score_display).indexOf('<') === -1 && String(row.score_display).indexOf('>') === -1) {
      ok('F. score_display HTML tags stripped before persist');
    } else bad('F. score_display', { status, json, row });
  }

  // H. staff identity
  {
    const staff = staffAccount();
    const state = { accounts: { rradle: staff }, entries: [] };
    addPaidRun(state, { characterName: 'staff_id:4', gameName: 'Memory Match', gameId: 'memory', runId: 'run_staff_h' });
    const env = makeEnv(state);
    const cookie = await cookieFor(staff);
    const { status, json } = await postRecord(env, cookie, {
      game_name: 'Memory Match',
      character_name: '20889',
      score: 12,
      score_display: '12s',
      run_id: 'run_staff_h',
    });
    const row = state.entries[0];
    if (status === 200 && json.ok && row && row.character_name === 'staff_id:4' && row.character_name !== '20889') {
      ok('H. staff session records under staff_id:N, not spoofed student name');
    } else bad('H. staff identity', { status, json, row });
  }

  // I. run_id idempotency
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Nugget Hunt', gameId: 'nuggetHunt', runId: 'hunt-run-abc' });
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const body = { game_name: 'Nugget Hunt', score: 9, score_display: '9s', run_id: 'hunt-run-abc' };
    const first = await postRecord(env, cookie, body);
    const second = await postRecord(env, cookie, body);
    if (first.status === 200 && second.status === 200 && second.json.idempotent === true && state.entries.length === 1 && second.json.id === first.json.id) {
      ok('I. duplicate run_id does not insert a second leaderboard row');
    } else bad('I. idempotency', { first, second, n: state.entries.length });
  }

  // J. Tower-shaped call: authenticated, no identity fields
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    addPaidRun(state, { characterName: '20889', gameName: 'Handbook Trivia', gameId: 'handbook-trivia', runId: 'run_hb_j' });
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postRecord(env, cookie, { game_name: 'Handbook Trivia', score: 70, score_display: '7/10 · 70 pts', run_id: 'run_hb_j' });
    if (status === 200 && json.ok && json.character_name === '20889' && !Object.prototype.hasOwnProperty.call({ game_name: 'Handbook Trivia', score: 70 }, 'character_name')) {
      ok('J. result submission without client identity uses session (Tower bridge contract)');
    } else bad('J. no-identity submit', { status, json });
  }

  // GET: unlisted game empty; catalog game ok
  {
    const state = {
      accounts: { '20889': studentAccount() },
      entries: [
        { id: 'lb1', game_name: 'Nugget Click Rush', character_name: '20889', score: 40, score_display: '40 taps', meta_json: '{}', created_at: new Date().toISOString() },
        { id: 'lb2', game_name: 'Secret Lab Game', character_name: '20889', score: 99999, score_display: 'hack', meta_json: '{}', created_at: new Date().toISOString() },
      ],
    };
    const env = makeEnv(state);
    const unlisted = await getLeaderboards(env, '?game_name=Secret%20Lab%20Game&period=all_time');
    if (unlisted.status === 200 && unlisted.json.ok && Array.isArray(unlisted.json.entries) && unlisted.json.entries.length === 0) {
      ok('GET unlisted/lab game_name returns empty entries');
    } else bad('GET unlisted', unlisted);

    const listed = await getLeaderboards(env, '?game_name=Nugget%20Click%20Rush&period=all_time');
    if (listed.status === 200 && listed.json.ok && listed.json.entries.some((e) => e.character_name === '20889')) {
      ok('GET registered game still returns production scores');
    } else bad('GET listed', listed);
  }

  // game_win identity: spoof ignored (session used). TMS bridge will 502 without mock; we only
  // assert the 401 unauthenticated path and that the worker source routes game_win through the
  // same resolver (source assertion above). A student spoof is rejected before TMS if we can
  // observe the resolved name via a missing-wallet path — skip live TMS here.
  {
    const env = makeEnv({ accounts: { '20889': studentAccount() } });
    const r = await postTransact(env, null, { kind: 'game_win', delta: 1, character_name: '20889' });
    if (r.status === 401 && r.json && r.json.error === 'not_authenticated') {
      ok('unauthenticated game_win rejected (same session gate as game_play)');
    } else bad('game_win unauthenticated', r);
  }

  console.log('\nLeaderboard record security tests (Prompt #128):', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
