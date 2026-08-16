/**
 * Prompt #149 — selected-game hero uses the same canonical catalog artwork as Games cards.
 * Usage: node worker/scripts/games-hero-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail || ''); }

const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const pageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerCss = fs.readFileSync(path.join(root, 'app/css/lantern-game-player.css'), 'utf8');

const sandbox = { window: {}, globalThis: {} };
sandbox.global = sandbox.window;
vm.runInNewContext(catalogJs, sandbox);
const cat = sandbox.window.LANTERN_GAME_CATALOG;
const games = cat.listGames();

if (games.length === 13) ok('catalog has 13 playable games');
else bad('catalog game count', String(games.length));

let allHaveImage = true;
games.forEach((g) => {
  if (!g.image || !String(g.image).startsWith('assets/')) allHaveImage = false;
});
if (allHaveImage) ok('every game has canonical assets/ artwork field');
else bad('missing artwork fields');

if (typeof cat.artworkUrl === 'function') {
  const urls = games.map((g) => cat.artworkUrl(g.id));
  const byName = games.map((g) => cat.artworkUrl(g.name));
  const same = urls.every((u, i) => u && u === games[i].image && u === byName[i]);
  if (same) ok('artworkUrl(id|name|game) returns the same canonical image as cards');
  else bad('artworkUrl mismatch');
} else bad('catalog.artworkUrl helper missing');

if (pageJs.includes('imageUrl: g.image') || pageJs.includes('imageUrl:g.image')) {
  ok('library cards use catalog g.image');
} else bad('card artwork source');

if (!playerJs.match(/if\s*\(\s*gameName\s*===|if\s*\(\s*opts\.title\s*===|avatar-match-card|reaction-tap-card/)) {
  ok('no hard-coded per-game image map in Game Player');
} else bad('per-game image map detected');

if (playerJs.includes('resolveGameMeta') && playerJs.includes('game.image') && playerJs.includes('onPregameStart')) {
  ok('shared resolveGameMeta + pregame Start path');
} else bad('shared hero implementation');

if (gamesHtml.includes('lanternGamePlayerPregame') && gamesHtml.includes('lanternGamePlayerHeroImg') && gamesHtml.includes('lanternGamePlayerStartBtn')) {
  ok('games.html has shared pregame hero shell');
} else bad('pregame shell markup');

if (gamesHtml.includes('onPregameStart') && gamesHtml.includes('startPaidGame')) {
  ok('tryPlay charges on pregame Start (economy timing preserved at Start)');
} else bad('tryPlay pregame charge wiring');

if (playerCss.includes('lanternGamePlayerHero') && playerCss.includes('object-fit: contain') && playerCss.includes('max-height')) {
  ok('hero CSS is large, contain-fit, responsive');
} else bad('hero CSS');

if (gamesHtml.includes('1 Nugget = 1 Play') || catalogJs.includes("'1 Nugget = 1 Play'")) {
  ok('1 Nugget = 1 Play card standard remains in catalog');
} else bad('play cost card meta');

// Future inheritance: a new catalog row with image would automatically feed resolveGameMeta
if (playerJs.includes('getGameByName') && playerJs.includes('getGameById') && !playerJs.includes('avatar-match')) {
  ok('future games inherit hero behavior via catalog lookup (no game-id branches)');
} else bad('future-game inheritance');

console.log('\ngames-hero-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
