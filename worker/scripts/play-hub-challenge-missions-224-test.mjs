/**
 * Prompt #224 — Play hub excludes Challenge/educational trivia missions.
 * Usage: node worker/scripts/play-hub-challenge-missions-224-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const eduJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;

const challengeIds = ['handbook-trivia', 'local-history-trivia', 'srp-safety-trivia', 'seven-habits-trivia'];
if (challengeIds.every((id) => cat.getGameById(id) && cat.getGameById(id).playHub === false)) {
  ok('1. Challenge trivia games remain in catalog but are marked playHub=false');
} else bad('1. playHub flag');

if (challengeIds.every((id) => !cat.isPlayHubGame(id)) && cat.playHubGames().every((g) => g.playHub !== false)) {
  ok('2. playHubGames() excludes Challenge missions');
} else bad('2. playHubGames');

if (cat.leaderboardGames().every((g) => challengeIds.indexOf(g.id) === -1)) {
  ok('3. Play leaderboards omit Challenge missions');
} else bad('3. leaderboards');

if (
  gamesPageJs.includes('playHubGames') &&
  !gamesHtml.includes('Premium Games') &&
  eduJs.includes("id: 'perm_seven_habits'") &&
  eduJs.includes("id: 'perm_handbook_trivia'")
) {
  ok('4. Play uses play-hub filter; missions catalog still has Challenge entries');
} else bad('4. wiring');

['tower', 'minecart-switch', 'orbit-lock', 'avatar-match', 'reaction'].forEach(function (id) {
  if (cat.isPlayHubGame(id) && cat.getGameById(id).play_cost === 1) ok(id + ' stays on Play at 1 Nugget');
  else bad(id + ' play hub/cost');
});

console.log('\nPlay hub Challenge Missions #224:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
