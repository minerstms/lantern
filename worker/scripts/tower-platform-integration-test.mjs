/**
 * Prompt #132 — Tower full Lantern platform integration.
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

const ORIGINAL_EIGHT = [
  'Avatar Match',
  'Lantern Live Trivia',
  'Handbook Trivia',
  'Local History Trivia',
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
const towerByName = cat.getGameByName('Tower');

// 1. Tower registered in canonical catalog
if (tower && towerByName && tower.id === 'tower' && tower.name === 'Tower' && tower.play_cost === 1) {
  ok('1. Tower registered in canonical frontend catalog (id tower / name Tower / cost 1)');
} else bad('1. frontend catalog', tower);
const serverTower = resolveRegisteredLeaderboardGame('tower');
if (serverTower && serverTower.name === 'Tower' && !serverTower.lowerIsBetter) {
  ok('1b. Tower registered in server catalog, higher-is-better');
} else bad('1b. server catalog', serverTower);
if (LANTERN_LEADERBOARD_GAMES.filter((g) => g.id === 'tower').length === 1) {
  ok('1c. Tower appears exactly once in the server catalog');
} else bad('1c. server catalog duplicates');

// 17. Play contains Tower exactly once
if (games.filter((g) => g.id === 'tower' || g.name === 'Tower').length === 1) {
  ok('17. Play catalog contains Tower exactly once');
} else bad('17. catalog tower count');
if ((gamesHtml.match(/id="towerPlayBtn"/g) || []).length === 1) {
  ok('17b. Play page has exactly one Tower play trigger');
} else bad('17b. play button count');

// 18. existing 8 games remain intact
const missing = ORIGINAL_EIGHT.filter((name) => !cat.getGameByName(name));
if (missing.length === 0 && games.length === 9) {
  ok('18. existing 8 games remain; catalog is 9');
} else bad('18. existing games', { missing, count: games.length });
ORIGINAL_EIGHT.forEach(function (name) {
  if (gamesHtml.includes("tryPlay('" + name + "'") || (name.indexOf('Trivia') !== -1 && gamesHtml.includes('tryPlay(\'' + name + '\''))) {
    ok('18b. existing play path intact: ' + name);
  } else if (name === 'Lantern Live Trivia' || name === 'Handbook Trivia' || name === 'Local History Trivia') {
    if (gamesHtml.includes("tryPlay('" + name + "'")) ok('18b. existing play path intact: ' + name);
    else bad('18b. missing tryPlay', name);
  } else if (gamesHtml.includes("tryPlay('" + name + "'")) {
    ok('18b. existing play path intact: ' + name);
  } else bad('18b. missing tryPlay', name);
});

// 2 / 3 / 4 identity: Tower cannot submit unauthenticated; session identity; donor spoof ignored
if (gamesHtml.includes("postLeaderboardScore('Tower'") && !/function postLeaderboardScore[\s\S]{0,900}character_name\s*:/.test(gamesHtml)) {
  ok('3. postLeaderboardScore used for Tower does not send character_name');
} else bad('3. character_name in record payload');
if (bridgeJs.includes('never send client-authoritative character_name') && bridgeJs.indexOf('character_name: identity.character_name') === -1) {
  ok('3b. game bridge no longer posts character_name');
} else bad('3b. bridge still sends character_name');
if (adapterJs.includes('stripForbidden') && adapterJs.includes('must NEVER send')) {
  ok('4. donor adapter forbids identity/reward fields');
} else bad('4. adapter contract');

// 5. paid start costs exactly 1 Nugget
if (gamesHtml.includes("tryPlay('Tower'") && gamesHtml.includes('LanternGamesPaidStart.startPaidGame') && tower.play_cost === 1) {
  ok('5. Tower uses shared paid-start; play_cost is 1 Nugget');
} else bad('5. paid start');
if (paidStartJs.includes("kind: 'game_play'") && paidStartJs.includes('delta: -cost')) {
  ok('5b. game_play delta is -cost (catalog-enforced 1)');
} else bad('5b. game_play delta');

// 6. insufficient balance blocks start
if (paidStartJs.includes("'insufficient'") && playerJs.includes('You need 1 Nugget to play')) {
  ok('6. insufficient balance uses existing pregame UX and does not start');
} else bad('6. insufficient UX');

// 7. balance display refreshes immediately from authoritative returned balance
if (
  paidStartJs.includes('balance_after') &&
  walletJs.includes('applyVisibleBalance') &&
  gamesPageJs.includes('applyWalletAmount') &&
  !paidStartJs.includes('available - cost') &&
  !paidStartJs.includes('available - 1')
) {
  ok('7. generic paid-start applies server balance_after; no local optimistic decrement');
} else bad('7. balance refresh');

// 8. stable run_id
if (
  gamesHtml.includes('getLastRunId') &&
  gamesHtml.match(/postLeaderboardScore\('Tower'[\s\S]{0,200}towerRunId/) &&
  gamesHtml.match(/awardGameWinWithEconomy\([\s\S]{0,200}'Tower'[\s\S]{0,400}towerRunId/)
) {
  ok('8. Tower score and win reward use paid-start run_id');
} else bad('8. run_id wiring');

// 9. valid score records — donor scoring model preserved
const utils = read('app/games/tower/donor/src/utils.js');
if (utils.includes('successScore || 25') && utils.includes('perfectScore || 25') && tower.scoring && tower.scoring.lowerIsBetter === false) {
  ok('9. Tower score is donor higher-is-better floor/perfect model');
} else bad('9. score model');
const towerScore = validateLeaderboardScore(serverTower, 250);
if (towerScore.ok && towerScore.score === 250) ok('9b. legitimate Tower score accepted');
else bad('9b. score validate', towerScore);
if (!validateLeaderboardScore(serverTower, -1).ok) ok('9c. negative Tower score rejected');
else bad('9c. negative score');

// 10. retry idempotency — source + worker (below)
if (workerIndex.includes("json_extract(meta_json, '$.run_id')") && gamesHtml.includes('leaderboardSubmitGuard')) {
  ok('10. leaderboard run_id idempotency + client submit guard remain');
} else bad('10. idempotency hooks');

// 11 / 12 qualifying win
if (tower.qualifyingWin && tower.qualifyingWin.floors === 10) {
  ok('11. qualifying win is 10 successful floors (catalog)');
} else bad('11. qualifying floors', tower && tower.qualifyingWin);
if (gamesHtml.includes('floors >= QUALIFYING_FLOORS') && gamesHtml.includes("awardGameWinWithEconomy(adopted.name, 'Tower', 1")) {
  ok('11b. qualifying win calls awardGameWinWithEconomy with +1');
} else bad('11b. win award call');
if (gamesHtml.includes('if (won && adopted)') && gamesHtml.includes('QUALIFYING_FLOORS')) {
  ok('12. non-qualifying loss does not award (won gate)');
} else bad('12. loss gate');

// 13. same run cannot repeatedly claim win
if (gamesHtml.includes('if (endedOnce) return') && gamesHtml.match(/awardGameWinWithEconomy\([\s\S]{0,400}towerRunId/)) {
  ok('13. endedOnce + run_id prevent repeat win claims on the same run');
} else bad('13. win idempotency');

// 14. First Game Played uses existing path
if (
  paidStartJs.includes('completeFirstGameLocal') &&
  workerIndex.includes('ensureFirstGameMissionCompletion') &&
  !gamesHtml.includes('first_game') &&
  !gamesHtml.match(/Tower[\s\S]{0,80}firstGame/)
) {
  ok('14. First Game Played stays on existing game_play path; no Tower-specific mission');
} else bad('14. first game');

// 15. normal player hides diagnostic lab data
if (
  !gamesHtml.includes('towerLabStatus') &&
  !gamesHtml.includes('PREVIEW MODE — RESULTS NOT SAVED') &&
  !gamesHtml.includes('Lab diagnostics') &&
  gamesHtml.includes('id="towerGameResult"')
) {
  ok('15. Play player has result overlay, not lab diagnostics');
} else bad('15. diagnostics leaked into Play');

// 16. lab remains unlinked
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
  ok('16. /game-lab/tower.html remains unlinked preview-only diagnostic');
} else bad('16. lab link or missing lab');

// Player shell / iframe isolation
if (
  gamesHtml.includes('id="towerGameSurface"') &&
  gamesHtml.includes('id="towerPlayFrame"') &&
  gamesHtml.includes('/games/tower/index.html?lanternPlay=1') &&
  gamesHtml.includes('lantern-game-bridge.js')
) {
  ok('Play shell iframes same-origin Tower after paid start');
} else bad('player iframe wiring');
if (gameHtml.includes('lanternPlay') && gameHtml.includes('if (lanternPlay) return')) {
  ok('production iframe disables donor free-replay reload');
} else bad('donor replay gate');
if (!adapterJs.includes('/api/economy') && !gameHtml.includes('/api/economy') && !gameHtml.includes('/api/leaderboards')) {
  ok('iframe donor code does not call economy or leaderboard APIs');
} else bad('iframe API calls');

// Ticker / leaderboard periods
if (tickerJs.includes("'Tower'") && catalogJs.includes("'24h': 'daily'") && catalogJs.includes("all: 'all_time'")) {
  ok('Tower is on the shared ticker/leaderboard period map');
} else bad('ticker/periods');

// Marquee hook
if (workerIndex.includes('student entered the {gameName} leaderboard') && workerIndex.includes('not Tower-specific')) {
  ok('generic marquee integration point documented on successful leaderboard insert');
} else bad('marquee hook');

// License notices retained
if (license.includes('Copyright (c) 2018 BMQB, Inc') && notices.includes('Caketown') && provenance.includes('CC-BY-SA')) {
  ok('MIT/third-party notices and Caketown attribution retained');
} else bad('notices');

// Mobile / overflow
if (
  playerCss.includes('.towerGameSurface') &&
  playerCss.includes('overflow: hidden') &&
  playerCss.includes('max-width: 100%') &&
  gamesHtml.includes('overflow-x: hidden') &&
  !gameHtml.includes('orientation: landscape')
) {
  ok('Tower player is single-column, overflow-clipped, portrait-ok');
} else bad('mobile/overflow');

if (exists('app/assets/tower-card.png') && tower.image === 'assets/tower-card.png') {
  ok('Tower Play card uses Lantern-branded catalog artwork');
} else bad('card artwork');

// ---------------------------------------------------------------------------
// Live Worker: unauthenticated / spoof / valid / retry
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
        return { results: state.entries.slice() };
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
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

async function main() {
  {
    const env = makeEnv({ entries: [] });
    const r = await postRecord(env, null, { game_name: 'Tower', score: 100, character_name: 'spoof' });
    if (r.status === 401 && r.json && r.json.error === 'not_authenticated') {
      ok('2. Tower cannot submit score unauthenticated');
    } else bad('2. unauthenticated Tower', r);
  }
  {
    const state = { accounts: { '20889': studentAccount() }, entries: [] };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const r = await postRecord(env, cookie, {
      game_name: 'Tower',
      character_name: 'DONOR_MUST_BE_IGNORED',
      score: 175,
      score_display: '175 pts',
      run_id: 'tower-int-1',
    });
    const row = state.entries[0];
    if (r.status === 200 && r.json.ok && r.json.character_name === '20889' && row && row.character_name === '20889' && row.game_name === 'Tower') {
      ok('3/4. Tower record identity is session 20889; donor spoof ignored');
    } else bad('3/4. spoof', { r, row });
    const retry = await postRecord(env, cookie, {
      game_name: 'Tower',
      score: 175,
      score_display: '175 pts',
      run_id: 'tower-int-1',
    });
    if (retry.json && retry.json.idempotent === true && state.entries.length === 1) {
      ok('10b. Tower retry with same run_id does not duplicate leaderboard row');
    } else bad('10b. Tower retry', { retry, n: state.entries.length });
  }

  console.log('\nTower platform integration tests (Prompt #132):', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
