/**
 * Prompt #238 — Avatar Match competitive modes, no Nugget earnings, accuracy-first boards.
 * Usage: node worker/scripts/avatar-match-game-238-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import worker from '../index.js';
import {
  avatarMatchModeAvailability,
  questionProgressLabel,
  teachingRevealCopy,
  selectUniqueTargets,
  encodeAvatarMatchScore,
  compareAvatarMatchScores,
  validateAvatarMatchResult,
  AVATAR_MATCH_MIN_POOL,
} from '../avatar-match-game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const clientJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar-match.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const gamesCss = fs.readFileSync(path.join(root, 'app/css/lantern-games-page.css'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const poolJs = fs.readFileSync(path.join(root, 'worker/avatar-match-pool.js'), 'utf8');
const paidStart = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(clientJs, sandbox);
const AM = sandbox.LanternAvatarMatch;

if (questionProgressLabel(1, 10) === 'Question 1 of 10' && questionProgressLabel(87, 87) === 'Question 87 of 87') {
  ok('Question X of Y wording');
} else bad('progress label');

if (teachingRevealCopy('Athena D.') === "That's Athena D." && teachingRevealCopy('Alex') === "That's Alex." && AM.teachingRevealCopy('Athena D.') === "That's Athena D.") {
  ok('teaching reveal does not double-period public names');
} else bad('teaching copy');

if (gamesHtml.includes("!overlay.classList.contains('is-avatar-match')) showTriviaFeedback")) {
  ok('Avatar Match skips leftover trivia Correct! banner');
} else bad('trivia banner skip');

if (!/Round \d+ of 5/.test(gamesHtml) && gamesHtml.includes('questionProgressLabel') && !gamesHtml.includes('roundsTotal = 5')) {
  ok('games.html no longer uses 5-round copy');
} else bad('old round copy', /Round 1 of 5/.test(gamesHtml));

const at87 = avatarMatchModeAvailability(87);
const at99 = avatarMatchModeAvailability(99);
const at100 = avatarMatchModeAvailability(100);
const at7 = avatarMatchModeAvailability(7);
const at3 = avatarMatchModeAvailability(3);

function mode(av, id) { return av.modes.find((m) => m.id === id); }

if (mode(at87, '10').enabled && mode(at87, '25').enabled && mode(at87, '50').enabled && !mode(at87, '100').enabled && mode(at87, 'full').enabled && mode(at87, 'full').questions === 87) {
  ok('87 users: 10/25/50 on, 100 grey, Full Roster = 87');
} else bad('87 availability', at87);

if (!mode(at99, '100').enabled) ok('100 disabled at 99');
else bad('100 at 99');
if (mode(at100, '100').enabled) ok('100 enabled at 100');
else bad('100 at 100');
if (mode(at7, 'full').enabled && !mode(at7, '10').enabled && at7.playable) ok('Full Roster enabled below 100 when min pool is met');
else bad('full at 7', at7);
if (!at3.playable && !mode(at3, 'full').enabled) ok('below minimum safety gate nothing is playable');
else bad('min gate', at3);

if (AM.modeAvailability(87).modes.find((m) => m.id === '100').enabled === false && AM.disabledReason(AM.modeAvailability(87).modes.find((m) => m.id === '100'), 87).indexOf('87 available') >= 0) {
  ok('disabled 100 explains required vs available');
} else bad('disabled reason');

const roster = [];
for (let i = 0; i < 12; i++) roster.push({ display_name: 'P' + i + '.', person_type: i === 0 ? 'staff' : 'student' });
const ten = selectUniqueTargets(roster, '10');
const names = ten.map((r) => r.display_name);
if (ten.length === 10 && new Set(names).size === 10) ok('unique targets within a 10-question run');
else bad('unique 10', names);
const full = selectUniqueTargets(roster, 'full');
if (full.length === 12 && new Set(full.map((r) => r.display_name)).size === 12) ok('Full Roster uses each eligible user once');
else bad('full unique', full.length);
if (full.some((r) => r.person_type === 'staff')) ok('staff included in unique Full Roster');
else bad('staff missing');

const a = { accuracy: 93, elapsed_ms: 500000 };
const b = { accuracy: 90, elapsed_ms: 10000 };
const c = { accuracy: 93, elapsed_ms: 400000 };
if (compareAvatarMatchScores(a, b) < 0 && compareAvatarMatchScores(c, a) < 0) {
  ok('accuracy-primary ordering; faster time wins a tie');
} else bad('ordering', { ab: compareAvatarMatchScores(a, b), ca: compareAvatarMatchScores(c, a) });

const sFastWrong = encodeAvatarMatchScore(9, 10, 1000);
const sSlowPerfect = encodeAvatarMatchScore(10, 10, 800000);
if (sSlowPerfect > sFastWrong) ok('encoded score keeps accuracy above speed');
else bad('encode', { sFastWrong, sSlowPerfect });

const good = validateAvatarMatchResult({ am_mode: '10', am_questions: 10, am_correct: 8, am_elapsed_ms: 40000, score: encodeAvatarMatchScore(8, 10, 40000) });
if (good.ok && good.score === encodeAvatarMatchScore(8, 10, 40000)) ok('valid Avatar Match result accepted and score recomputed');
else bad('valid result', good);
if (!validateAvatarMatchResult({ am_mode: '10', am_questions: 10, am_correct: 8, am_elapsed_ms: 40000, score: 1 }).ok) {
  ok('forged {correct:100,time:1}-style score rejected');
} else bad('forged score accepted');
const fullSeg = validateAvatarMatchResult({ am_mode: 'full', am_questions: 87, am_correct: 80, am_elapsed_ms: 500000 });
if (fullSeg.ok && fullSeg.questions === 87) ok('Full Roster result is segmented by question_count');
else bad('full validate', fullSeg);

if (
  gamesHtml.includes("startPaidGame('Avatar Match'") &&
  gamesHtml.includes('showModeSelector') &&
  !/tryPlay\('Avatar Match'/.test(gamesHtml) &&
  gamesHtml.includes('skipPregame: true')
) {
  ok('mode selector opens without tryPlay charge; paid start happens on confirm');
} else bad('charge timing');

if (!/awardGameWinWithEconomy\([^)]*Avatar Match/.test(gamesHtml) && !/kind:\s*'game_win'/.test(gamesHtml.slice(gamesHtml.indexOf('function openAvatarMatch'), gamesHtml.indexOf('function openAvatarMatch') + 9000))) {
  ok('Avatar Match never awards game_win');
} else bad('game_win leak');

if (gamesHtml.includes('No Nugget rewards') && paidStart.includes("kind: 'game_play'")) {
  ok('completion awards zero Nuggets; play still uses authoritative game_play');
} else bad('economy copy');

if (workerIndex.includes("json_extract(meta_json, '$.am_mode')") && workerIndex.includes('validateAvatarMatchResult') && workerIndex.includes("amMode === 'full'")) {
  ok('fixed modes and Full Roster question_count use separate leaderboard filters');
} else bad('leaderboard filter');

if (gamesHtml.includes('public_display_name') || workerIndex.includes('public_display_name')) {
  ok('leaderboard identity stays on public_display_name');
} else bad('privacy label');

if (
  gamesPageJs.includes('id="gamesAmDivisions"') &&
  gamesPageJs.includes('data-am-lb-default="10"') &&
  gamesPageJs.includes('data-am-lb-mode=') &&
  gamesPageJs.includes("amModalMode: '10'")
) {
  ok('visible mode selector exists for leaderboard and defaults to 10');
} else bad('lb division selector');

if (gamesPageJs.includes("amMode: '10'") && gamesPageJs.includes("url += '&am_mode=' + encodeURIComponent(mode)")) {
  ok('default Avatar Match carousel/board fetch stays on 10');
} else bad('default 10 fetch');

if (
  gamesPageJs.includes("amMode: state.amModalMode") &&
  gamesPageJs.includes("amQuestions: state.amModalMode === 'full' ? count : 0") &&
  gamesPageJs.includes("url += '&am_questions='")
) {
  ok('selecting a division fetches that mode only; Full Roster includes current am_questions');
} else bad('division fetch filters');

if (
  gamesPageJs.includes("{ id: '25'") &&
  gamesPageJs.includes("{ id: '50'") &&
  gamesPageJs.includes("{ id: '100'") &&
  gamesPageJs.includes("loadAvatarMatchModalBoard(game, mode, state.amEligibleCount)") &&
  gamesPageJs.includes("url += '&am_mode=' + encodeURIComponent(mode)")
) {
  ok('selecting 25/50/100 fetches that mode only');
} else bad('clicked mode fetch');

if (gamesPageJs.includes('openAvatarMatchLeaderboard') && gamesHtml.includes('avatarMatchViewLbBtn') && gamesHtml.includes('openAvatarMatchLeaderboard(modeId, total)')) {
  ok('results can reach the just-played mode leaderboard');
} else bad('results lb link');

if (!/openAvatarMatchLeaderboard[\s\S]{0,400}startPaidGame/.test(gamesPageJs) && !/data-am-lb-mode[\s\S]{0,400}startPaidGame/.test(gamesPageJs) && !/avatarMatchViewLbBtn[\s\S]{0,500}startPaidGame/.test(gamesHtml)) {
  ok('no Nugget charge for leaderboard viewing');
} else bad('lb view charge leak');

if (gamesPageJs.includes('leaderboardPublicLabel') && gamesPageJs.includes('public_display_name') && !gamesPageJs.includes('username +') && gamesPageJs.includes("return 'Player'")) {
  ok('privacy-safe names only on Avatar Match boards');
} else bad('lb privacy');

if (gamesPageJs.includes('res.you') && !gamesPageJs.includes('findUserRank')) {
  ok('You matching uses server account identity, not rendered labels');
} else bad('you matching source');

if (gamesCss.includes('.gamesAmDivisions') && gamesCss.includes('flex-wrap: wrap') && gamesCss.includes('overflow-x: hidden') && gamesCss.includes('z-index: 10200')) {
  ok('phone layout wraps leaderboard divisions without page overflow');
} else bad('lb responsive css');

if (
  gamesHtml.includes('is-avatar-match') &&
  gamesHtml.includes('lanternInteractiveSurface') &&
  !/\.cultureGameOverlay\.is-avatar-match\{[\s\S]*?overflow:\s*hidden/.test(gamesHtml)
) {
  ok('Avatar Match uses the universal surface; no overflow:hidden zoom trap');
} else bad('modal css');

if (poolJs.includes('buildAvatarMatchCharacters') && workerIndex.includes('loadPublicAvatarKeyMap') && workerIndex.includes('expandPublicAvatarAliases')) {
  ok('#236 eligibility path still wired');
} else bad('#236 regression');

if (AM.MIN_POOL === AVATAR_MATCH_MIN_POOL && AM.questionProgressLabel(2, 25) === 'Question 2 of 25') {
  ok('client helpers match worker progress wording');
} else bad('client/worker wording');

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
    sub: account.username, role: account.role, scn: account.student_character_name || null,
    tid: account.teacher_id || null, iat: now, exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function makeLbEnv(state) {
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
          return state.paid.find((t) => String(t.meta_json || '').includes(binds[0] || binds[binds.length - 1])) || state.paid[0] || null;
        }
        if (s.includes('FROM lantern_leaderboard_entries') && s.includes('run_id')) {
          return state.entries.find((e) => e.character_name === binds[0] && e.game_name === binds[1]) || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_leaderboard_entries')) {
          let rows = state.entries.slice();
          if (s.includes("json_extract(meta_json, '$.am_mode')")) {
            const mode = binds[binds.findIndex((b, i) => typeof b === 'string' && ['10', '25', '50', '100', 'full'].includes(b))] || binds[1];
            rows = rows.filter((e) => {
              const meta = JSON.parse(e.meta_json || '{}');
              if (meta.am_mode !== mode) return false;
              if (mode === 'full' && s.includes('am_questions')) {
                const q = binds.find((b) => typeof b === 'number' && b > 4 && b < 10000);
                if (q && meta.am_questions !== q) return false;
              }
              return true;
            });
          }
          const best = {};
          rows.forEach((e) => {
            if (!best[e.character_name] || e.score > best[e.character_name].score) best[e.character_name] = e;
          });
          return { results: Object.values(best).sort((a, b) => b.score - a.score) };
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

const student = { username: '20889', role: 'student', display_name: 'Lucas R.', mtss_student_id: '20889', student_character_name: '20889', is_active: 1 };
const cookie = await cookieFor(student);
const now = new Date().toISOString();
function paidTx(runId) {
  return {
    id: 'tx-' + runId,
    character_name: '20889',
    delta: -1,
    kind: 'game_play',
    created_at: now,
    meta_json: JSON.stringify({ run_id: runId, game_name: 'Avatar Match', game_id: 'avatar-match' }),
  };
}

{
  const state = { accounts: { '20889': student }, entries: [], paid: [paidTx('run-am-1')] };
  const env = makeLbEnv(state);
  const forged = await worker.fetch(new Request('https://lantern.example/api/leaderboards/record', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_name: 'Avatar Match', score: 100, run_id: 'run-am-1', am_mode: '10', am_questions: 10, am_correct: 100, am_elapsed_ms: 1 }),
  }), env);
  const forgedJson = await forged.json();
  if (forged.status === 400 && forgedJson.error) ok('API rejects impossible Avatar Match score payload');
  else bad('api forged', { status: forged.status, forgedJson });
}

{
  const score = encodeAvatarMatchScore(10, 10, 120000);
  const state = { accounts: { '20889': student }, entries: [], paid: [paidTx('run-am-2')] };
  const env = makeLbEnv(state);
  const res = await worker.fetch(new Request('https://lantern.example/api/leaderboards/record', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_name: 'Avatar Match', score, run_id: 'run-am-2', am_mode: '10', am_questions: 10, am_correct: 10, am_elapsed_ms: 120000 }),
  }), env);
  const json = await res.json();
  if (res.status === 200 && json.ok && state.entries[0] && JSON.parse(state.entries[0].meta_json).am_mode === '10') {
    ok('API records Avatar Match 10-question division in existing leaderboard table');
  } else bad('api record 10', { status: res.status, json, row: state.entries[0] });
}

console.log('\n--- avatar-match-game-238-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
