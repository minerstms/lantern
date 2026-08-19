/**
 * Prompt #241 — Avatar Match leaderboard public identity + current-user matching.
 * Usage: node worker/scripts/leaderboard-identity-241-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { encodeAvatarMatchScore, compareAvatarMatchScores } from '../avatar-match-game.js';
import {
  entryMatchesViewer,
  publicLeaderboardEntry,
  resolveLeaderboardPublicName,
  viewerLeaderboardIdentityKeys,
} from '../leaderboard-public-identity.js';
import { buildStaffPublicNameIndex } from '../staff-public-name.js';

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

function radle() {
  return {
    username: 'rick.radle',
    display_name: 'Rick Radle',
    first_name: 'Rick',
    last_name: 'Radle',
    honorific: 'Mr.',
    public_display_name: 'Mr. Radle',
    role: 'teacher',
    student_character_name: null,
    teacher_id: 'T1',
    mtss_student_id: null,
    staff_id: 4,
    is_active: 1,
    must_change_password: 0,
  };
}

function otherStaffSamePublicName() {
  return {
    username: 'other.radle',
    display_name: 'Owen Radle',
    first_name: 'Owen',
    last_name: 'Radle',
    honorific: 'Mr.',
    public_display_name: 'Mr. Radle',
    role: 'teacher',
    student_character_name: null,
    teacher_id: 'T2',
    mtss_student_id: null,
    staff_id: 9,
    is_active: 1,
    must_change_password: 0,
  };
}

function athena() {
  return {
    username: '20891',
    display_name: 'Athena Diaz',
    first_name: 'Athena',
    last_name: 'Diaz',
    public_display_name: 'Athena D.',
    role: 'student',
    student_character_name: '20891',
    teacher_id: null,
    mtss_student_id: '20891',
    staff_id: null,
    is_active: 1,
    must_change_password: 0,
  };
}

function paidTx(characterName, runId) {
  return {
    id: 'tx-' + runId,
    character_name: characterName,
    delta: -1,
    kind: 'game_play',
    created_at: new Date().toISOString(),
    meta_json: JSON.stringify({ run_id: runId, game_name: 'Avatar Match', game_id: 'avatar-match' }),
  };
}

function metaOf(row) {
  try { return JSON.parse(row.meta_json || '{}'); } catch (_) { return {}; }
}

function applyAmFilters(rows, sql, binds) {
  if (!String(sql).includes("json_extract(meta_json, '$.am_mode')")) return rows;
  const mode = binds.find((b) => ['10', '25', '50', '100', 'full'].includes(String(b)));
  let out = rows.filter((e) => metaOf(e).am_mode === mode);
  if (mode === 'full' && String(sql).includes('am_questions')) {
    const nums = binds.filter((b) => typeof b === 'number' && Number.isFinite(b));
    const q = String(sql).includes('LIMIT ?') ? nums[nums.length - 2] : nums[nums.length - 1];
    if (q) out = out.filter((e) => Number(metaOf(e).am_questions) === Number(q));
  }
  return out;
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.entries = state.entries || [];
  state.paid = state.paid || [];

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_transactions') && s.includes('run_id')) {
          const runId = binds.find((b) => String(b || '').indexOf('run-') === 0) || binds[0];
          return state.paid.find((t) => String(t.meta_json || '').includes(runId)) || null;
        }
        if (s.includes('FROM lantern_leaderboard_entries') && s.includes('run_id')) {
          return state.entries.find((e) => {
            const meta = metaOf(e);
            return e.character_name === binds[0] && e.game_name === binds[1] && meta.run_id === binds[2];
          }) || null;
        }
        if (s.includes('FROM lantern_leaderboard_entries') && s.includes('character_name IN')) {
          const inMatch = s.match(/character_name IN \(([^)]+)\)/);
          const inCount = inMatch ? inMatch[1].split(',').length : 1;
          const keys = binds.slice(0, inCount).map((k) => String(k || '').trim().toLowerCase());
          const gameName = binds[inCount];
          let rows = state.entries.filter((e) =>
            keys.includes(String(e.character_name || '').trim().toLowerCase()) && e.game_name === gameName
          );
          rows = applyAmFilters(rows, s, binds);
          rows.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
          return rows[0] || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('teacher')) {
          return { results: Object.values(state.accounts) };
        }
        if (s.includes('FROM tms_identity_links')) return { results: [] };
        if (s.includes('FROM lantern_leaderboard_entries')) {
          let rows = state.entries.slice();
          if (s.includes('game_name = ?')) {
            const gameName = binds.find((b) => String(b) === 'Avatar Match' || String(b) === 'Nugget Click Rush') || binds[0];
            rows = rows.filter((e) => e.game_name === gameName);
          }
          rows = applyAmFilters(rows, s, binds);
          const best = {};
          rows.forEach((e) => {
            if (!best[e.character_name] || Number(e.score) > Number(best[e.character_name].score)) {
              best[e.character_name] = e;
            }
          });
          return { results: Object.values(best).sort((a, b) => Number(b.score) - Number(a.score)) };
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
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET, _state: state };
}

async function recordAm(env, cookie, body) {
  const res = await worker.fetch(new Request('https://lantern.example/api/leaderboards/record', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
  return { status: res.status, json: await res.json() };
}

async function getBoard(env, query, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example/api/leaderboards' + query, {
    method: 'GET',
    headers,
  }), env);
  return { status: res.status, json: await res.json() };
}

function privateLeak(obj) {
  const text = JSON.stringify(obj);
  const forbidden = ['character_name', 'student_id', 'mtss_student_id', 'username', 'staff_id', 'rick.radle', 'staff_id:4', '20891'];
  return forbidden.filter((k) => {
    if (k.indexOf(':') >= 0 || /^\d+$/.test(k) || k.indexOf('.') >= 0) return text.indexOf(k) !== -1;
    return new RegExp('"' + k + '"').test(text);
  });
}

// ---------------------------------------------------------------------------
// Unit: identity helpers
// ---------------------------------------------------------------------------
{
  const keys = viewerLeaderboardIdentityKeys(radle(), 'staff_id:4');
  if (keys.includes('staff_id:4') && keys.includes('rick.radle') && !keys.includes('Mr. Radle')) {
    ok('viewer keys use durable account identity, not the public label');
  } else bad('viewer keys', keys);
}

{
  const idx = buildStaffPublicNameIndex([radle(), athena()]);
  if (resolveLeaderboardPublicName(idx, 'staff_id:4') === 'Mr. Radle') {
    ok('read-time resolve staff_id:4 → Mr. Radle');
  } else bad('resolve staff_id', resolveLeaderboardPublicName(idx, 'staff_id:4'));
  if (resolveLeaderboardPublicName(idx, '20891') === 'Athena D.') {
    ok('read-time resolve student key → Athena D.');
  } else bad('resolve student', resolveLeaderboardPublicName(idx, '20891'));
  if (!resolveLeaderboardPublicName(idx, 'ghost_unknown_99')) {
    ok('unresolvable key has no guessed public name');
  } else bad('guessed ghost', resolveLeaderboardPublicName(idx, 'ghost_unknown_99'));
}

{
  if (entryMatchesViewer('staff_id:4', ['staff_id:4', 'rick.radle']) && !entryMatchesViewer('staff_id:9', ['staff_id:4', 'rick.radle'])) {
    ok('you-matching is by durable key, not lookalike names');
  } else bad('entry match');
}

{
  const stripped = publicLeaderboardEntry({
    rank: 1,
    character_name: 'staff_id:4',
    public_display_name: 'Mr. Radle',
    display_name: 'Mr. Radle',
    game_name: 'Avatar Match',
    score: 1,
    score_display: '10/10',
    username: 'rick.radle',
  });
  if (stripped.public_display_name === 'Mr. Radle' && !Object.prototype.hasOwnProperty.call(stripped, 'character_name') && !stripped.username) {
    ok('public entry strips internal identity fields');
  } else bad('strip', stripped);
}

// ---------------------------------------------------------------------------
// Client contract
// ---------------------------------------------------------------------------
{
  const page = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
  if (
    page.includes('fillYouLine(youEl, res && res.ok ? res.you : null)') &&
    page.includes('you: res && res.ok ? res.you || null : null') &&
    !page.includes('findUserRank') &&
    !/character_name\s*===\s*userKey/.test(page) &&
    !/adoptedName\(\)[\s\S]{0,80}findUser/.test(page)
  ) {
    ok('client You line uses server you, not display-name equality');
  } else bad('client you matching');
  if (page.includes("return 'Player'") && page.includes('public_display_name') && !page.includes('username +')) {
    ok('client still falls back to Player only when no public name');
  } else bad('client player fallback');
}

// ---------------------------------------------------------------------------
// A/B/C — Mr. Radle records AM 10, list shows Mr. Radle, You matches
// ---------------------------------------------------------------------------
{
  const staff = radle();
  const state = {
    accounts: { 'rick.radle': staff },
    entries: [],
    paid: [paidTx('staff_id:4', 'run-241-a')],
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(staff);
  const score = encodeAvatarMatchScore(10, 10, 50000);
  const rec = await recordAm(env, cookie, {
    game_name: 'Avatar Match',
    score,
    run_id: 'run-241-a',
    am_mode: '10',
    am_questions: 10,
    am_correct: 10,
    am_elapsed_ms: 50000,
  });
  if (rec.status !== 200 || !rec.json.ok || !state.entries[0] || state.entries[0].character_name !== 'staff_id:4') {
    bad('A record staff_id', { rec, row: state.entries[0] });
  } else {
    const listed = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=10&limit=25', cookie);
    const row = listed.json.entries && listed.json.entries[0];
    if (listed.status === 200 && row && row.public_display_name === 'Mr. Radle' && row.display_name === 'Mr. Radle') {
      ok('A. authenticated Mr. Radle 10-question run displays Mr. Radle');
    } else bad('A display', listed);
    if (listed.json.you && listed.json.you.rank === 1 && listed.json.you.public_display_name === 'Mr. Radle') {
      ok('B. same user viewing 10 board resolves You to that entry');
    } else bad('B you', listed.json.you);
    if (listed.json.you && staff.username !== staff.public_display_name) {
      ok('C. display name differs from username and still matches');
    } else bad('C username vs display');
  }
}

// ---------------------------------------------------------------------------
// D/E — other player + duplicate-looking public name
// ---------------------------------------------------------------------------
{
  const staff = radle();
  const twin = otherStaffSamePublicName();
  const student = athena();
  const staffScore = encodeAvatarMatchScore(10, 10, 50000);
  const studentScore = encodeAvatarMatchScore(9, 10, 40000);
  const twinScore = encodeAvatarMatchScore(8, 10, 30000);
  const state = {
    accounts: {
      'rick.radle': staff,
      'other.radle': twin,
      '20891': student,
    },
    entries: [
      {
        id: 'lb-staff',
        game_name: 'Avatar Match',
        character_name: 'staff_id:4',
        score: staffScore,
        score_display: '10/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
      {
        id: 'lb-athena',
        game_name: 'Avatar Match',
        character_name: '20891',
        score: studentScore,
        score_display: '9/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
      {
        id: 'lb-twin',
        game_name: 'Avatar Match',
        character_name: 'staff_id:9',
        score: twinScore,
        score_display: '8/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
    ],
    paid: [],
  };
  const env = makeEnv(state);
  const listed = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=10&limit=25', await cookieFor(staff));
  const names = (listed.json.entries || []).map((e) => e.public_display_name);
  const athenaRow = (listed.json.entries || []).find((e) => e.public_display_name === 'Athena D.');
  if (athenaRow && athenaRow.rank !== listed.json.you.rank) {
    ok('D. another player appears normally and is not mistaken for current user');
  } else bad('D other player', { names, you: listed.json.you, athenaRow });
  const twinRows = (listed.json.entries || []).filter((e) => e.public_display_name === 'Mr. Radle');
  if (twinRows.length === 2 && listed.json.you && listed.json.you.rank === 1) {
    ok('E. duplicate-looking public names do not cause false You matching');
  } else bad('E twins', { twinRows, you: listed.json.you });
}

// ---------------------------------------------------------------------------
// F/G — mode isolation + Full Roster question-count
// ---------------------------------------------------------------------------
{
  const staff = radle();
  const ten = encodeAvatarMatchScore(10, 10, 50000);
  const full87 = encodeAvatarMatchScore(80, 87, 400000);
  const state = {
    accounts: { 'rick.radle': staff },
    entries: [
      {
        id: 'lb-10',
        game_name: 'Avatar Match',
        character_name: 'staff_id:4',
        score: ten,
        score_display: '10/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
      {
        id: 'lb-full',
        game_name: 'Avatar Match',
        character_name: 'staff_id:4',
        score: full87,
        score_display: '80/87',
        meta_json: JSON.stringify({ am_mode: 'full', am_questions: 87 }),
        created_at: new Date().toISOString(),
      },
    ],
    paid: [],
  };
  const env = makeEnv(state);
  const cookie = await cookieFor(staff);
  const tenBoard = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=10&limit=25', cookie);
  const twentyFive = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=25&limit=25', cookie);
  if (tenBoard.json.you && tenBoard.json.you.rank === 1 && !twentyFive.json.you) {
    ok('F. 10-mode You does not leak into 25-mode board');
  } else bad('F isolation', { tenYou: tenBoard.json.you, twentyFiveYou: twentyFive.json.you });

  const fullMatch = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=full&am_questions=87&limit=25', cookie);
  const fullOther = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=full&am_questions=40&limit=25', cookie);
  if (fullMatch.json.you && fullMatch.json.you.rank === 1 && !fullOther.json.you) {
    ok('G. Full Roster You requires matching am_questions');
  } else bad('G full roster', { fullMatch: fullMatch.json.you, fullOther: fullOther.json.you });
}

// ---------------------------------------------------------------------------
// H — Player fallback when identity cannot be resolved
// ---------------------------------------------------------------------------
{
  const state = {
    accounts: { 'rick.radle': radle() },
    entries: [
      {
        id: 'lb-ghost',
        game_name: 'Avatar Match',
        character_name: 'ghost_unknown_99',
        score: encodeAvatarMatchScore(7, 10, 60000),
        score_display: '7/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
    ],
    paid: [],
  };
  const env = makeEnv(state);
  const listed = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=10&limit=25');
  const row = listed.json.entries && listed.json.entries[0];
  if (row && (row.public_display_name == null || row.public_display_name === '') && row.display_name == null) {
    ok('H. row lacking resolvable public identity leaves Player fallback to the client');
  } else bad('H ghost', row);
}

// ---------------------------------------------------------------------------
// I — no private identifiers in client payload
// ---------------------------------------------------------------------------
{
  const staff = radle();
  const state = {
    accounts: { 'rick.radle': staff, '20891': athena() },
    entries: [
      {
        id: 'lb-i',
        game_name: 'Avatar Match',
        character_name: 'staff_id:4',
        score: encodeAvatarMatchScore(10, 10, 50000),
        score_display: '10/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
      {
        id: 'lb-i2',
        game_name: 'Avatar Match',
        character_name: '20891',
        score: encodeAvatarMatchScore(9, 10, 40000),
        score_display: '9/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
    ],
    paid: [],
  };
  const env = makeEnv(state);
  const listed = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=10&limit=25', await cookieFor(staff));
  const leaks = privateLeak({ entries: listed.json.entries, you: listed.json.you, am_mode: listed.json.am_mode });
  if (!leaks.length && listed.json.entries.every((e) => e.public_display_name && !e.character_name)) {
    ok('I. no private identifiers exposed to client');
  } else bad('I privacy', { leaks, entries: listed.json.entries, you: listed.json.you });
}

// ---------------------------------------------------------------------------
// J — #238 accuracy-first ranking unchanged
// ---------------------------------------------------------------------------
{
  const accurateSlow = encodeAvatarMatchScore(10, 10, 800000);
  const fastWrong = encodeAvatarMatchScore(9, 10, 1000);
  if (accurateSlow > fastWrong && compareAvatarMatchScores({ accuracy: 100, elapsed_ms: 800000 }, { accuracy: 90, elapsed_ms: 1000 }) < 0) {
    ok('J. Avatar Match accuracy-first ranking helper unchanged');
  } else bad('J helper');
  const staff = radle();
  const student = athena();
  const state = {
    accounts: { 'rick.radle': staff, '20891': student },
    entries: [
      {
        id: 'lb-slow',
        game_name: 'Avatar Match',
        character_name: 'staff_id:4',
        score: accurateSlow,
        score_display: '10/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
      {
        id: 'lb-fast',
        game_name: 'Avatar Match',
        character_name: '20891',
        score: fastWrong,
        score_display: '9/10',
        meta_json: JSON.stringify({ am_mode: '10', am_questions: 10 }),
        created_at: new Date().toISOString(),
      },
    ],
    paid: [],
  };
  const env = makeEnv(state);
  const listed = await getBoard(env, '?game_name=Avatar%20Match&period=all_time&am_mode=10&limit=25');
  const first = listed.json.entries && listed.json.entries[0];
  const second = listed.json.entries && listed.json.entries[1];
  if (first && second && first.public_display_name === 'Mr. Radle' && second.public_display_name === 'Athena D.' && first.score > second.score) {
    ok('J. Avatar Match #238 ranking order unchanged on the public board');
  } else bad('J board order', listed.json.entries);
}

console.log('\nleaderboard-identity-241-test: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
