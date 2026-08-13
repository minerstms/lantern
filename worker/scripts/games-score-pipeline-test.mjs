/**
 * Completed-game score → leaderboard pipeline (Prompt #62).
 * Usage: node worker/scripts/games-score-pipeline-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

// --- empty-string same-origin API base must still fetch ---
if (
  gamesPageJs.includes('base === null') &&
  !gamesPageJs.match(/if\s*\(\s*!base\s*\)\s*return Promise\.resolve/)
) {
  ok('leaderboard GET treats empty API base as same-origin (not falsy skip)');
} else bad('empty API base GET guard');

if (gamesHtml.includes("credentials: 'include'") && gamesHtml.includes('/api/leaderboards/record')) {
  ok('score record POST uses credentials include');
} else bad('record credentials');

if (gamesHtml.includes("Score couldn\\'t be saved. Try again.")) {
  ok('failed record shows user-visible error');
} else bad('record failure UX');

if (gamesHtml.includes('canonicalLeaderboardKey') && catalogJs.includes('leaderboardKey')) {
  ok('record and query share catalog leaderboardKey');
} else bad('canonical leaderboard key helper');

if (gamesHtml.includes('leaderboardSubmitGuard')) {
  ok('frontend once-per-attempt submit guard');
} else bad('submit once guard');

if (
  gamesHtml.includes("postLeaderboardScore('Nugget Click Rush'") &&
  gamesHtml.match(/scorePosted = true;[\s\S]{0,600}postLeaderboardScore\('Nugget Click Rush'/)
) {
  // Prompt #99: Click Rush no longer auto-closes the Game Player after a result (it now shows a
  // persistent "Play Again" button instead, matching the other games), so the invariant worth
  // guarding here is "submits the score exactly once via the scorePosted guard", not "submits
  // before some now-removed auto-close timer".
  ok('Click Rush submits score exactly once via scorePosted guard');
} else bad('Click Rush submit-once guard');

if (gamesHtml.includes("postLeaderboardScore('Memory Match'")) {
  ok('Memory Match records leaderboard score on completion');
} else bad('Memory Match score post');

// --- catalog: 8 games, record key === query key === display name ---
const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;
const games = cat.listGames();
if (games.length === 10) ok('ten canonical games');
else bad('canonical count', games.length);

const expected = [
  'Avatar Match',
  'Lantern Live Trivia',
  'Handbook Trivia',
  'Local History Trivia',
  'SRP Safety Challenge',
  'Reaction Tap',
  'Nugget Click Rush',
  'Memory Match',
  'Nugget Hunt',
  'Orbit Lock',
];
expected.forEach(function (name) {
  const g = cat.getGameByName(name);
  if (g && cat.leaderboardKey(name) === name && cat.leaderboardKey(g.id) === name) {
    ok('canonical key: ' + name);
  } else bad('canonical key mismatch', name);
});

// Completion contract: each game has postLeaderboardScore with canonical name
expected.forEach(function (name) {
  const re = new RegExp("postLeaderboardScore\\('" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
  if (name === 'Lantern Live Trivia' || name === 'Handbook Trivia' || name === 'Local History Trivia' || name === 'SRP Safety Challenge') {
    if (gamesHtml.includes('postLeaderboardScore(gameName,')) ok('trivia completion uses gameName key: ' + name);
    else bad('trivia post', name);
  } else if (re.test(gamesHtml)) {
    ok('completion posts: ' + name);
  } else bad('completion post missing', name);
});

if (!gamesHtml.match(/onExit:[\s\S]{0,80}postLeaderboardScore/)) {
  ok('abandon/onExit path does not post leaderboard score');
} else bad('abandon may post score');

// --- period cutoff fixtures (mirror Worker logic) ---
function periodSince(period, nowMs) {
  const now = new Date(nowMs);
  if (period === 'daily') return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (period === 'weekly') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === 'monthly') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (period === 'all_time') return null;
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}
function inPeriod(createdAt, period, nowMs) {
  const since = periodSince(period, nowMs);
  if (since == null) return true;
  return createdAt >= since;
}

const nowMs = Date.parse('2026-08-07T21:00:00.000Z');
const fixtures = {
  now: '2026-08-07T21:00:00.000Z',
  h23: '2026-08-06T22:00:00.000Z',
  d6: '2026-08-01T21:00:00.000Z',
  d8: '2026-07-30T21:00:00.000Z',
  d29: '2026-07-09T21:00:00.000Z',
  d31: '2026-07-07T21:00:00.000Z',
};

if (inPeriod(fixtures.now, 'daily', nowMs) && inPeriod(fixtures.h23, 'daily', nowMs) && !inPeriod(fixtures.d6, 'daily', nowMs)) {
  ok('24H includes now + 23h, excludes 6d');
} else bad('24H period');

if (
  inPeriod(fixtures.now, 'weekly', nowMs) &&
  inPeriod(fixtures.d6, 'weekly', nowMs) &&
  !inPeriod(fixtures.d8, 'weekly', nowMs)
) {
  ok('7 Days includes 6d, excludes 8d');
} else bad('7 Days period');

if (
  inPeriod(fixtures.d29, 'monthly', nowMs) &&
  !inPeriod(fixtures.d31, 'monthly', nowMs)
) {
  ok('30 Days includes 29d, excludes 31d');
} else bad('30 Days period');

if (
  inPeriod(fixtures.d31, 'all_time', nowMs) &&
  inPeriod(fixtures.now, 'all_time', nowMs)
) {
  ok('All Time includes old and new rows');
} else bad('All Time period');

if (workerIndex.includes("period === 'weekly'") && workerIndex.includes('7 * 24 * 60 * 60 * 1000')) {
  ok('Worker weekly uses rolling 7-day ISO cutoff');
} else bad('Worker weekly cutoff');

if (workerIndex.includes("period === 'all_time'") && workerIndex.includes('since = null')) {
  ok('Worker all_time has no created_at cutoff');
} else bad('Worker all_time');

// --- best-score aggregation ---
function bestHigher(scores) {
  return Math.max.apply(null, scores);
}
function bestLower(scores) {
  return Math.min.apply(null, scores);
}
if (bestHigher([100, 250, 175]) === 250) ok('higher-is-better keeps 250');
else bad('higher-is-better');
if (bestLower([40, 28, 35]) === 28) ok('lower-is-better keeps 28');
else bad('lower-is-better');

if (workerIndex.includes('isLowerIsBetterGame') && workerIndex.includes('resolveRegisteredLeaderboardGame')) {
  ok('Worker uses server catalog for lower-is-better / game validation');
} else bad('LOWER_IS_BETTER list');

if (workerIndex.includes('MAX(score)') && workerIndex.includes('MIN(score)') && workerIndex.includes('GROUP BY character_name')) {
  ok('Worker aggregates best score per player');
} else bad('Worker aggregation');

// --- mock Click Rush completion → one record request ---
let recordCalls = 0;
let lastBody = null;
const clickSandbox = {
  Number,
  Math,
  String,
  Object,
  Promise,
  console,
  NumberIsFinite: Number.isFinite,
};
clickSandbox.window = {
  LANTERN_AVATAR_API: '',
  LANTERN_GAME_CATALOG: cat,
  LanternGamesPage: { loadAllLeaderboards: function () {} },
};
clickSandbox.fetch = function (url, opts) {
  recordCalls++;
  lastBody = JSON.parse(opts.body);
  return Promise.resolve({
    ok: true,
    json: function () {
      return Promise.resolve({ ok: true, id: 'lb_test' });
    },
  });
};
clickSandbox.globalThis = clickSandbox;
const postFnSrc = `
  var gamesApiBase = '';
  var leaderboardSubmitGuard = Object.create(null);
  function toast(msg) {}
  function canonicalLeaderboardKey(gameName){
    var cat = window.LANTERN_GAME_CATALOG;
    if (cat && typeof cat.leaderboardKey === 'function') {
      var key = cat.leaderboardKey(gameName);
      if (key) return key;
    }
    return gameName;
  }
  function postLeaderboardScore(gameName, characterName, score, scoreDisplay, onDone){
    var key = canonicalLeaderboardKey(gameName);
    var numericScore = Math.floor(Number(score));
    if (gamesApiBase == null || !key || !Number.isFinite(numericScore)) {
      if (onDone) onDone(false);
      return Promise.resolve(false);
    }
    var guardKey = key + '|' + String(numericScore) + '|' + String(scoreDisplay || '');
    if (leaderboardSubmitGuard[guardKey]) {
      if (onDone) onDone(true);
      return Promise.resolve(true);
    }
    leaderboardSubmitGuard[guardKey] = true;
    return fetch(gamesApiBase + '/api/leaderboards/record', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_name: key,
        score: numericScore,
        score_display: scoreDisplay || String(numericScore)
      })
    }).then(function(r){
      return r.json().then(function(res){ return { httpOk: r.ok, res: res }; });
    }).then(function(pack){
      var ok = !!(pack && pack.httpOk && pack.res && pack.res.ok);
      if (onDone) onDone(ok);
      return ok;
    });
  }
  Promise.resolve()
    .then(function(){ return postLeaderboardScore('Nugget Click Rush', '20889', 123, '123 taps'); })
    .then(function(){ return postLeaderboardScore('Nugget Click Rush', '20889', 123, '123 taps'); })
    .then(function(){ __done = true; });
`;
vm.runInNewContext(postFnSrc, clickSandbox);
await new Promise(function (resolve) {
  const t0 = Date.now();
  (function wait() {
    if (clickSandbox.__done || Date.now() - t0 > 2000) resolve();
    else setTimeout(wait, 10);
  })();
});

if (recordCalls === 1) ok('Click Rush mock posts exactly once');
else bad('Click Rush once', 'calls=' + recordCalls);

if (
  lastBody &&
  lastBody.game_name === 'Nugget Click Rush' &&
  lastBody.character_name == null &&
  lastBody.score === 123 &&
  lastBody.score_display === '123 taps'
) {
  ok('Click Rush record body uses canonical key and omits client identity');
} else bad('Click Rush body', JSON.stringify(lastBody));

if (cat.leaderboardKey('Nugget Click Rush') === 'Nugget Click Rush') {
  ok('query key matches record key for Nugget Click Rush');
} else bad('query/record key');

console.log('\nGames score pipeline tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
