/**
 * Games page routing — no startup redirect to Locker (Prompt #60).
 * Usage: node worker/scripts/games-routing-test.mjs
 */
import fs from 'fs';
import path from 'path';
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
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const pilotAuthJs = fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8');

if (!gamesHtml.includes('redirectIfNoCharacter')) {
  ok('redirectIfNoCharacter removed from games.html');
} else bad('redirectIfNoCharacter still present');

if (!gamesHtml.match(/location\.(href|replace|assign)\s*=\s*['"]locker\.html/)) {
  ok('games.html has no startup location redirect to locker.html');
} else bad('games.html still redirects to locker on load');

if (gamesHtml.includes('guardPilotPage({ mode: \'general\' }') && gamesHtml.includes('__bootGamesPage')) {
  ok('Games boots after guardPilotPage callback');
} else bad('guardPilotPage callback boot missing');

if (gamesHtml.includes('lantern-class-access-resolved') && gamesHtml.includes('__bootGamesPage')) {
  ok('Games boots on class-access resolved');
} else bad('class-access boot wiring missing');

if (gamesHtml.includes('getCachedPilotMe') && gamesHtml.includes('authenticated !== true')) {
  ok('boot waits for authenticated session cache');
} else bad('auth-ready boot guard missing');

if (pilotAuthJs.includes("'/games': '/games.html'")) {
  ok('pilot-auth maps /games to /games.html');
} else bad('/games route normalization');

if (navJs.includes('href="games.html"') && !navJs.match(/Play[\s\S]{0,80}href="locker\.html"/)) {
  ok('nav Play link targets games.html not locker');
} else bad('nav Play destination');

if (!paidStartJs.match(/startPaidGame\s*\([\s\S]*location\.|DOMContentLoaded|init\s*\(/)) {
  ok('paid-start does not auto-run on module load');
} else bad('paid-start may run on load');

if (paidStartJs.includes('function startPaidGame') && !paidStartJs.includes('location.replace')) {
  ok('paid-start has no navigation side effects');
} else bad('paid-start navigation');

if (gamesHtml.includes('LanternWallet') || gamesHtml.includes('fetchMyWallet')) {
  ok('wallet fetch on startup path preserved');
} else bad('wallet startup');

console.log('\nGames routing tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
