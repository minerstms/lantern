/**
 * Lantern Game Starter Kit — contract tests (Prompt #155).
 *
 * Evaluates every live production game against the canonical contract, and proves
 * the template spec is complete but excluded from the production catalog.
 *
 * Usage: node worker/scripts/game-starter-contract-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {
  evaluateGameContract,
  evaluateSpecShape,
  loadProductionGameContext,
  catalogsAligned,
  findDuplicateIds,
  TEMPLATE_GAME_ID,
  REPO_ROOT,
} from './game-contract-lib.mjs';
import { STARTER_TAP_ONCE_SPEC } from '../../dev/game-starter/tap-once.spec.mjs';
import { FRONTEND_CATALOG_EXAMPLE, WORKER_ALLOWLIST_EXAMPLE } from '../../dev/game-starter/register.example.js';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  validateLeaderboardScore,
} from '../lantern-game-catalog.js';

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

const ctx = loadProductionGameContext();
const { frontend, frontendGames, workerGames, gamesHtml, navJs, workerIndex, paidStartJs, starterJs } = ctx;

const PRODUCTION_BOUNDS = {
  'avatar-match': { scoreMin: 0, scoreMax: 500, lowerIsBetter: false },
  'lantern-live-trivia': { scoreMin: 0, scoreMax: 100, lowerIsBetter: false },
  'handbook-trivia': { scoreMin: 0, scoreMax: 100, lowerIsBetter: false },
  'local-history-trivia': { scoreMin: 0, scoreMax: 100, lowerIsBetter: false },
  reaction: { scoreMin: 0, scoreMax: 600000, lowerIsBetter: true },
  clickrush: { scoreMin: 0, scoreMax: 10000, lowerIsBetter: false },
  memory: { scoreMin: 0, scoreMax: 3600, lowerIsBetter: true },
  nuggetHunt: { scoreMin: 0, scoreMax: 120, lowerIsBetter: true },
};

// --- catalogs stay aligned; no duplicate IDs ---
const aligned = catalogsAligned(frontendGames, workerGames);
if (aligned.ok) ok('frontend and worker catalogs have the same ids and names');
else bad('catalog mismatch', JSON.stringify(aligned));

const feDupes = findDuplicateIds(frontendGames);
const wrDupes = findDuplicateIds(workerGames);
if (!feDupes.length && !wrDupes.length) ok('no duplicate game ids in either catalog');
else bad('duplicate ids', feDupes.concat(wrDupes).join(','));

if (frontendGames.length === LANTERN_LEADERBOARD_GAMES.length && frontendGames.length >= 8) {
  ok('production catalog count is ' + frontendGames.length);
} else bad('production catalog count', frontendGames.length);

// --- each live game satisfies the contract ---
frontendGames.forEach(function (g) {
  const wr = resolveRegisteredLeaderboardGame(g.id);
  const bounds = PRODUCTION_BOUNDS[g.id] || (wr ? { scoreMin: wr.scoreMin, scoreMax: wr.scoreMax, lowerIsBetter: wr.lowerIsBetter } : {});
  const spec = {
    id: g.id,
    name: g.name,
    type: g.type,
    playBtnId: g.playBtnId,
    play_cost: g.play_cost,
    leaderboard: g.leaderboard,
    description: g.description,
    scoreMin: bounds.scoreMin,
    scoreMax: bounds.scoreMax,
    lowerIsBetter: bounds.lowerIsBetter,
    scoring: g.scoring,
  };
  const result = evaluateGameContract(spec, ctx, { requireProductionRegistration: true });
  if (result.ok) ok('production contract: ' + g.id);
  else bad('production contract: ' + g.id, result.problems.join('; '));
});

// --- paid start / TMS / run_id still the shared path ---
if (
  paidStartJs.includes("kind: 'game_play'") &&
  paidStartJs.includes('postEconomyTransact') &&
  paidStartJs.includes('run_id: runId') &&
  paidStartJs.includes('function startPaidGame')
) {
  ok('paid-start uses TMS transact + run_id (no local wallet)');
} else bad('paid-start economy contract');

if (paidStartJs.includes('return 1') && paidStartJs.includes('playCostForGame')) {
  ok('ordinary play cost forced to 1 Nugget');
} else bad('play cost is not 1');

if (
  workerIndex.includes('resolveRegisteredLeaderboardGame') &&
  workerIndex.includes("path === '/api/leaderboards/record'") &&
  workerIndex.includes('validateLeaderboardScore') &&
  workerIndex.includes('sanitizeRunId')
) {
  ok('worker record route uses allowlist + score bounds + run_id sanitizer');
} else bad('worker leaderboard record contract');

if (workerIndex.includes('resolveEconomyGamePlayTransact') && workerIndex.includes("kindEarly === 'game_play'")) {
  ok('worker game_play uses session/TMS identity');
} else bad('worker game_play identity');

if (gamesHtml.includes('guardPilotPage({ mode: \'general\' }') || gamesHtml.includes('guardPilotPage({ mode: "general" }')) {
  ok('games.html requires signed-in pilot session');
} else bad('games.html auth guard');

if (navJs.includes('href="games.html"') && navJs.includes('data-page="play"')) {
  ok('Play nav route is games.html');
} else bad('Play nav route');

if (!gamesHtml.includes('lantern-game-starter.js')) {
  ok('production games.html does not load the starter helper (existing games unchanged)');
} else bad('starter helper unexpectedly linked from games.html');

if (!navJs.includes('starter-tap-once') && !navJs.includes('Tap Once')) {
  ok('nav does not link the template game');
} else bad('nav links template game');

// --- reusable evaluator: unknown id fails closed ---
const bogus = evaluateGameContract(
  {
    id: 'not-a-real-game',
    name: 'Not A Real Game',
    type: 'arcade',
    playBtnId: 'notARealGamePlayBtn',
    play_cost: 1,
    leaderboard: true,
    description: 'Should not exist in production catalogs.',
    scoreMin: 0,
    scoreMax: 10,
    lowerIsBetter: false,
  },
  ctx,
  { requireProductionRegistration: true }
);
if (!bogus.ok && bogus.problems.some((p) => /frontend catalog/.test(p))) {
  ok('unknown game id fails production registration check');
} else bad('unknown id should fail', bogus.problems.join('; '));

// --- template spec is complete AND excluded from production ---
const templateShape = evaluateSpecShape(STARTER_TAP_ONCE_SPEC, { strictKebab: true });
if (templateShape.ok) ok('template spec shape is complete');
else bad('template spec shape', templateShape.problems.join('; '));

if (STARTER_TAP_ONCE_SPEC.id === TEMPLATE_GAME_ID) ok('template id is starter-tap-once');
else bad('template id');

const templateExcluded = evaluateGameContract(STARTER_TAP_ONCE_SPEC, ctx, {
  requireProductionRegistration: false,
  forbidProductionRegistration: true,
});
if (templateExcluded.ok) ok('template is excluded from production catalog/allowlist/games.html');
else bad('template leaked into production', templateExcluded.problems.join('; '));

if (!resolveRegisteredLeaderboardGame(TEMPLATE_GAME_ID) && !resolveRegisteredLeaderboardGame(STARTER_TAP_ONCE_SPEC.name)) {
  ok('worker allowlist rejects template id/name');
} else bad('worker allowlist contains template');

const outOfRange = validateLeaderboardScore(
  { scoreMin: STARTER_TAP_ONCE_SPEC.scoreMin, scoreMax: STARTER_TAP_ONCE_SPEC.scoreMax },
  2
);
if (!outOfRange.ok && outOfRange.error === 'score_out_of_range') ok('template score bounds reject 2');
else bad('template bounds');

const inRange = validateLeaderboardScore(
  { scoreMin: STARTER_TAP_ONCE_SPEC.scoreMin, scoreMax: STARTER_TAP_ONCE_SPEC.scoreMax },
  1
);
if (inRange.ok && inRange.score === 1) ok('template score bounds accept 1');
else bad('template in-range');

// --- starter helper contract (source-level, no production behavior change) ---
if (
  starterJs.includes('function missionLaunchContext') &&
  starterJs.includes('fromMission: false') &&
  starterJs.includes("params.get('mission')") &&
  !starterJs.includes('startRun(')
) {
  ok('starter reads Mission URL context and does not auto-start a Mission');
} else bad('starter mission context');

if (starterJs.includes('function clearMissionQuery') && starterJs.includes("searchParams.delete('mission')")) {
  ok('starter can strip ?mission= so Play Again is ordinary play');
} else bad('starter clearMissionQuery');

if (
  starterJs.includes('LanternGamesPaidStart.startPaidGame') &&
  starterJs.includes('LanternGamePlayer.open') &&
  starterJs.includes('onPregameStart')
) {
  ok('starter openPaidGame reuses Game Player + paid start');
} else bad('starter openPaidGame');

if (
  starterJs.includes('/api/leaderboards/record') &&
  starterJs.includes("credentials: 'include'") &&
  starterJs.includes('payload.run_id') &&
  !/character_name\s*:/.test(starterJs)
) {
  ok('starter postScore uses secure record route, run_id, no client character_name');
} else bad('starter postScore');

if (starterJs.includes('LanternWallet.fetchMyBalance')) {
  ok('starter refreshBalance uses TMS wallet helper');
} else bad('starter wallet');

const starterSandbox = { window: {}, globalThis: {}, URLSearchParams, URL, Promise, Number, Math, String, setTimeout, fetch: undefined };
starterSandbox.window = starterSandbox.globalThis = starterSandbox;
vm.runInNewContext(starterJs, starterSandbox);
const Starter = starterSandbox.LanternGameStarter;
const ordinary = Starter.missionLaunchContext({ search: '?game=handbook-trivia' });
const missioned = Starter.missionLaunchContext({ search: '?game=handbook-trivia&mission=perm_handbook_trivia' });
if (ordinary.fromMission === false && ordinary.gameId === 'handbook-trivia') {
  ok('ordinary ?game= is not a Mission');
} else bad('ordinary launch context', ordinary);
if (missioned.fromMission === true && missioned.missionId === 'perm_handbook_trivia') {
  ok('?mission= is detected without starting a Mission');
} else bad('mission launch context', missioned);

const tapOnceJs = fs.readFileSync(path.join(REPO_ROOT, 'dev/game-starter/tap-once.js'), 'utf8');
const tapSandbox = { window: {}, globalThis: {} };
tapSandbox.window = tapSandbox.globalThis = tapSandbox;
vm.runInNewContext(tapOnceJs, tapSandbox);
const tap = tapSandbox.LANTERN_STARTER_TAP_ONCE;
if (tap && typeof tap.mount === 'function' && tap.SPEC && tap.SPEC.id === TEMPLATE_GAME_ID) {
  const fakeRoot = {
    querySelector: function () { return null; },
  };
  const api = tap.mount(fakeRoot, {});
  if (api && typeof api.start === 'function' && typeof api.render === 'function' && typeof api.end === 'function') {
    ok('template exposes start/render/end');
  } else bad('template mount api');
} else bad('template tap-once module');

if (FRONTEND_CATALOG_EXAMPLE.id === 'your-game-id' && WORKER_ALLOWLIST_EXAMPLE.id === 'your-game-id') {
  ok('registration example uses placeholder id (not a live game)');
} else bad('registration example');

const templateHtml = fs.readFileSync(path.join(REPO_ROOT, 'dev/game-starter/tap-once.html'), 'utf8');
if (templateHtml.includes('TEMPLATE ONLY') && templateHtml.includes('noindex')) {
  ok('template HTML is marked non-production');
} else bad('template HTML banner');

if (!gamesHtml.includes('starter-tap-once') && !gamesHtml.includes('starterTapOncePlayBtn')) {
  ok('games.html has no template trigger');
} else bad('games.html template leak');

const kitDoc = fs.readFileSync(path.join(REPO_ROOT, 'docs/LANTERN_GAME_STARTER_KIT.md'), 'utf8');
if (
  kitDoc.includes('GAME CREATION CHECKLIST') &&
  kitDoc.includes('Existing exceptions') &&
  kitDoc.includes('LanternGamesPaidStart') &&
  kitDoc.includes('/api/leaderboards/record')
) {
  ok('starter kit documentation exists');
} else bad('starter kit documentation');

console.log('\nGame starter contract tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
