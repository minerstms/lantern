/**
 * Prompt #237 — finished Orbit Lock / Stack Lab / Minecart Switch game-card artwork.
 * Usage: node worker/scripts/game-card-art-237-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function pngSize(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function loadCatalog() {
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8'), sandbox);
  return sandbox.LANTERN_GAME_CATALOG;
}

const cat = loadCatalog();
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const pageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const gamesCss = fs.readFileSync(path.join(root, 'app/css/lantern-games-page.css'), 'utf8');

const expected = {
  'orbit-lock': { name: 'Orbit Lock', image: 'assets/orbit-lock-card.png', file: 'app/assets/orbit-lock-card.png' },
  tower: { name: 'Stack Lab', image: 'assets/tower-card.png', file: 'app/assets/tower-card.png' },
  'minecart-switch': { name: 'Minecart Switch', image: 'assets/minecart-switch-card.png', file: 'app/assets/minecart-switch-card.png' },
};

Object.keys(expected).forEach((id) => {
  const g = cat.getGameById(id);
  const spec = expected[id];
  if (g && g.name === spec.name && g.image === spec.image && cat.artworkUrl(id) === spec.image) {
    ok(id + ' catalog maps ' + spec.name + ' → ' + spec.image);
  } else bad(id + ' mapping', g);
});

const unchanged = {
  'avatar-match': 'assets/avatar-match-card.png',
  'lantern-live-trivia': 'assets/lantern-trivia-card.png',
  'handbook-trivia': 'assets/handbook-triva-card.png',
  'local-history-trivia': 'assets/history-trivia-card.png',
  'srp-safety-trivia': 'assets/srp-safety.png',
  'seven-habits-trivia': 'assets/lantern-trivia-card.png',
  reaction: 'assets/reaction-tap-card.png',
  clickrush: 'assets/nugget-click-rush-card.png',
  memory: 'assets/memory-match-card.png',
  nuggetHunt: 'assets/nugget-hunt-card.png',
};

let othersOk = true;
Object.keys(unchanged).forEach((id) => {
  const g = cat.getGameById(id);
  if (!g || g.image !== unchanged[id]) othersOk = false;
});
if (othersOk && !catalogJs.includes('orbit-lock-card.svg')) {
  ok('no other catalog game-art paths changed; Orbit Lock no longer uses the SVG placeholder');
} else bad('other art changed');

Object.keys(expected).forEach((id) => {
  const spec = expected[id];
  const buf = fs.readFileSync(path.join(root, spec.file));
  const size = pngSize(buf);
  const ratio = size ? size.w / size.h : 0;
  if (size && Math.abs(ratio - 16 / 9) < 0.03 && buf.length > 100000) {
    ok(spec.name + ' artwork is a finished 16:9 PNG (' + size.w + '×' + size.h + ')');
  } else bad(spec.name + ' dimensions', size);
});

if (
  /--lantern-card-aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss) &&
  /object-fit:\s*cover/.test(cardsCss) &&
  /aspect-ratio:\s*16\s*\/\s*9/.test(gamesCss) &&
  /\.gamesLbArtworkImg[\s\S]{0,80}object-fit:\s*cover/.test(gamesCss) &&
  /width:\s*100%/.test(gamesCss)
) {
  ok('shared Games/library CSS keeps 16:9 cover, width 100%, no one-off sizing');
} else bad('card CSS contract');

if (pageJs.includes('imageUrl: g.image') && pageJs.includes('data-game-id') && catalogJs.includes("'1 Nugget = 1 Play'")) {
  ok('cards still render from catalog IDs; Nugget overlay copy stays in UI, not baked into mapping');
} else bad('renderer / overlay');

if (!fs.existsSync(path.join(root, 'app/assets/orbit-lock-card.svg'))) {
  ok('placeholder orbit-lock-card.svg removed so only one Orbit Lock card asset remains');
} else bad('svg leftover');

console.log('\n--- game-card-art-237-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
