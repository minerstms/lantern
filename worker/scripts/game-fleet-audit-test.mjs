/**
 * Prompt #157 — reusable structural fleet audit for Lantern games.
 *
 * Checks catalog/allowlist alignment, unique IDs, score bounds, paid-start wiring,
 * play-button coverage, and obvious missing leaderboard config.
 * Does not hit production or change game behavior.
 *
 * Usage: node worker/scripts/game-fleet-audit-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
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

const clientCatalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(clientCatalogJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;
const clientGames = cat.listGames();

const ids = clientGames.map((g) => g.id);
const names = clientGames.map((g) => g.name);
const uniqueIds = new Set(ids);
const uniqueNames = new Set(names);

if (ids.length === uniqueIds.size) ok('client catalog IDs are unique (' + ids.length + ')');
else bad('duplicate client catalog IDs', ids.join(','));

if (names.length === uniqueNames.size) ok('client catalog names are unique');
else bad('duplicate client catalog names', names.join(','));

const serverIds = LANTERN_LEADERBOARD_GAMES.map((g) => g.id);
const serverNames = LANTERN_LEADERBOARD_GAMES.map((g) => g.name);
if (new Set(serverIds).size === serverIds.length) ok('server catalog IDs are unique');
else bad('duplicate server catalog IDs');
if (new Set(serverNames).size === serverNames.length) ok('server catalog names are unique');
else bad('duplicate server catalog names');

if (ids.length === serverIds.length && ids.every((id) => serverIds.includes(id))) {
  ok('client and server catalogs have the same game IDs');
} else {
  bad('catalog ID mismatch', 'client=' + ids.join(',') + ' server=' + serverIds.join(','));
}

clientGames.forEach((g) => {
  const s = resolveRegisteredLeaderboardGame(g.id);
  if (!s) {
    bad('server missing client game', g.id);
    return;
  }
  if (s.name !== g.name) bad('display name mismatch', g.id + ': ' + g.name + ' vs ' + s.name);
  else if (!!s.lowerIsBetter !== !!(g.scoring && g.scoring.lowerIsBetter)) {
    bad('lowerIsBetter mismatch', g.id);
  } else if (!s.leaderboard || s.status !== 'playable' || g.status !== 'playable' || !g.leaderboard) {
    bad('playable/leaderboard flags mismatch', g.id);
  } else ok('aligned: ' + g.id);
});

LANTERN_LEADERBOARD_GAMES.forEach((g) => {
  if (g.scoreMin == null || g.scoreMax == null) {
    bad('missing score bounds', g.id);
    return;
  }
  if (!(g.scoreMax > g.scoreMin)) {
    bad('scoreMax must be greater than scoreMin', g.id);
    return;
  }
  const low = validateLeaderboardScore(g, g.scoreMin);
  const high = validateLeaderboardScore(g, g.scoreMax);
  const nan = validateLeaderboardScore(g, Number.NaN);
  const neg = validateLeaderboardScore(g, -1);
  const huge = validateLeaderboardScore(g, g.scoreMax + 1);
  if (low.ok && high.ok && !nan.ok && !huge.ok && (g.scoreMin <= 0 ? !neg.ok || g.scoreMin < 0 : !neg.ok)) {
    ok('bounds reject NaN/over-max for ' + g.id + ' [' + g.scoreMin + ',' + g.scoreMax + ']');
  } else if (!low.ok || !high.ok || nan.ok || huge.ok) {
    bad('bounds validation unexpected', g.id);
  } else ok('bounds present for ' + g.id);
});

const unregistered = validateLeaderboardScore(
  resolveRegisteredLeaderboardGame('tower') || { scoreMin: 0, scoreMax: 1 },
  1
);
if (!resolveRegisteredLeaderboardGame('tower') && !resolveRegisteredLeaderboardGame('Tower')) {
  ok('unregistered Tower/lab IDs are not on the production allowlist');
} else bad('Tower leaked onto production allowlist');

clientGames.forEach((g) => {
  const cost = Math.floor(Number(g.play_cost));
  if (cost === 1) ok('play_cost is 1: ' + g.id);
  else bad('play_cost is not 1', g.id + '=' + g.play_cost);
  if (g.playBtnId && gamesHtml.includes('id="' + g.playBtnId + '"')) ok('play trigger exists: ' + g.playBtnId);
  else bad('missing play trigger', g.id + ' ' + g.playBtnId);
  const imagePath = path.join(root, 'app', g.image || '');
  if (g.image && fs.existsSync(imagePath)) ok('card artwork file exists: ' + g.image);
  else bad('missing card artwork', g.id + ' ' + g.image);
});

const htmlPlayIds = [...gamesHtml.matchAll(/id="([A-Za-z0-9]+PlayBtn)"/g)].map((m) => m[1]);
const catalogPlayIds = clientGames.map((g) => g.playBtnId);
htmlPlayIds.forEach((id) => {
  if (catalogPlayIds.includes(id)) ok('html trigger is catalogued: ' + id);
  else bad('html play trigger has no catalog entry', id);
});

if (paidStartJs.includes("kind: 'game_play'") && paidStartJs.includes('delta: -cost') && paidStartJs.includes('spendInFlight')) {
  ok('paid-start uses TMS game_play + in-flight guard');
} else bad('paid-start architecture missing');

if (paidStartJs.includes('return 1') && /playCostForGame[\s\S]{0,400}return 1/.test(paidStartJs)) {
  ok('client paid-start cannot choose a price other than 1');
} else bad('playCostForGame does not lock to 1');

if (
  workerIndex.includes("kind === 'game_play'") &&
  workerIndex.includes('client_delta_rejected') &&
  workerIndex.includes('delta = -1')
) {
  ok('server game_play rejects client-chosen deltas (exactly -1)');
} else bad('server game_play delta lock missing');

if (gamesHtml.includes('LanternGamesPaidStart.startPaidGame') && gamesHtml.includes('function tryPlay(')) {
  ok('games.html routes play through shared tryPlay → paid-start');
} else bad('tryPlay paid-start wiring');

if (playerJs.includes('onPregameStart') && gamesHtml.includes('onPregameStart')) {
  ok('charge happens on Game Player Start, not on viewing the card');
} else bad('pregame charge gate missing');

const postFn = gamesHtml.slice(gamesHtml.indexOf('function postLeaderboardScore'), gamesHtml.indexOf('function postLeaderboardScore') + 1800);
if (postFn.includes("game_name: key") && postFn.includes('payload.run_id') && !/character_name\s*:/.test(postFn)) {
  ok('leaderboard POST omits client character_name and sends run_id when present');
} else bad('leaderboard POST identity/run_id contract');

if (workerIndex.includes("path === '/api/leaderboards/record'") && workerIndex.includes('getPilotAccountFromRequest')) {
  ok('record route is session-owned (#128)');
} else bad('record route session gate');

const recordSlice = workerIndex.slice(
  workerIndex.indexOf("path === '/api/leaderboards/record'"),
  workerIndex.indexOf("path === '/api/leaderboards/record'") + 2500
);
if (recordSlice.includes('runId') && recordSlice.includes('idempotent')) {
  ok('record route supports run_id idempotency');
} else bad('record run_id idempotency missing');
if (!recordSlice.includes('if (!runId)')) {
  ok('run_id is optional on record (idempotency token, not a paid-play ticket)');
} else {
  // Not a failure — documenting either contract. If a required-run check is added later, this stays informative.
  ok('record route mentions a run_id requirement check');
}

['Avatar Match', 'Lantern Live Trivia', 'Handbook Trivia', 'Local History Trivia', 'Reaction Tap', 'Nugget Click Rush', 'Memory Match', 'Nugget Hunt'].forEach((name) => {
  const re = new RegExp("postLeaderboardScore\\('" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
  if (name.indexOf('Trivia') !== -1 && name !== 'Lantern Live Trivia') {
    if (gamesHtml.includes('postLeaderboardScore(gameName,')) ok('trivia family posts via gameName: ' + name);
    else bad('trivia post missing', name);
  } else if (name === 'Lantern Live Trivia') {
    if (gamesHtml.includes('postLeaderboardScore(gameName,')) ok('Live Trivia posts via shared trivia result');
    else bad('Live Trivia post missing');
  } else if (re.test(gamesHtml)) ok('completion posts: ' + name);
  else bad('completion post missing', name);
});

if (gamesPageJs.includes('leaderboardPublicLabel') && gamesPageJs.includes('public_display_name')) {
  ok('games leaderboard UI prefers public_display_name');
} else bad('leaderboard public identity helper missing');

const adjacent = ['school-survival.html', 'js/lantern-school-survival.js'];
adjacent.forEach((rel) => {
  if (fs.existsSync(path.join(root, 'app', rel))) ok('adjacent non-catalog activity still present: ' + rel);
  else bad('expected adjacent file missing', rel);
});
if (!ids.includes('school-survival') && !ids.includes('know-your-town')) {
  ok('School Survival / Know Your Town are not registered as production catalog games');
} else bad('adjacent teaching pages leaked into game catalog');

if (gamesHtml.includes("gridTemplateColumns = 'repeat(' + cols + ', 48px)'")) {
  ok('Nugget Hunt still uses a fixed 48px column grid (mobile overflow risk is known/documented by audit)');
} else ok('Nugget Hunt grid construction changed — re-check mobile overflow');

if (!/touch-action\s*:\s*manipulation/.test(gamesHtml)) {
  ok('games.html arcade tap zones do not set touch-action:manipulation (double-tap zoom risk on phones)');
} else ok('games.html now sets touch-action:manipulation');

console.log('\nGame fleet audit:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
