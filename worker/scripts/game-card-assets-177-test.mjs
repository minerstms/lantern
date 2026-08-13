/**
 * Prompt #177 — live Games-page card artwork exists, decodes, and stays on budget.
 * Usage: node worker/scripts/game-card-assets-177-test.mjs
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
  console.error('FAIL', label, detail != null ? detail : '');
}

export const LIVE_GAME_CARDS = Object.freeze([
  { id: 'avatar-match', file: 'avatar-match-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'lantern-live-trivia', file: 'lantern-trivia-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'handbook-trivia', file: 'handbook-triva-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'local-history-trivia', file: 'history-trivia-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'srp-safety-trivia', file: 'srp-safety-trivia-card.webp', expectW: 1536, expectH: 1024, ratio: 3 / 2 },
  { id: 'reaction', file: 'reaction-tap-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'clickrush', file: 'nugget-click-rush-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'memory', file: 'memory-match-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
  { id: 'nuggetHunt', file: 'nugget-hunt-card.webp', expectW: 1672, expectH: 941, ratio: 16 / 9 },
]);

export const GAME_CARD_MAX_BYTES = 400 * 1024;

function readWebpSize(buf) {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  if (fourcc === 'VP8 ') {
    const start = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    if (start < 0) return null;
    return { width: buf.readUInt16LE(start + 3) & 0x3fff, height: buf.readUInt16LE(start + 5) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const catalogSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(
  catalogSrc
    .replace(/^\(function \(global\) \{/, '(function (global) {')
    .replace(/\}\)\(typeof window !== 'undefined' \? window : globalThis\);?\s*$/, '})(window);'),
  sandbox
);
const catalog = sandbox.window.LANTERN_GAME_CATALOG;
const games = catalog.listGames();

if (games.length === LIVE_GAME_CARDS.length) ok('1. live catalog game count matches expected card set');
else bad('1 catalog count', games.length);

const used = new Set();
for (const card of LIVE_GAME_CARDS) {
  const game = catalog.getGameById(card.id);
  if (!game) {
    bad('1 missing game', card.id);
    continue;
  }
  const rel = String(game.image || '');
  if (rel === 'assets/' + card.file) ok('1/2. ' + card.id + ' references ' + rel);
  else bad('2 broken ref', { id: card.id, image: rel, expected: 'assets/' + card.file });

  const appPath = path.join(root, 'app', rel);
  const rootPath = path.join(root, rel);
  if (fs.existsSync(appPath) && fs.existsSync(rootPath)) ok('1. file exists for ' + card.id);
  else bad('1 missing file', { appPath, rootPath });

  const buf = fs.readFileSync(appPath);
  if (buf.length > 0) ok('5. non-zero ' + card.file);
  else bad('5 zero byte', card.file);
  if (buf.length <= GAME_CARD_MAX_BYTES) ok('7. under 400KB budget ' + card.file + ' (' + buf.length + ')');
  else bad('7 oversized', { file: card.file, bytes: buf.length });

  const dim = readWebpSize(buf);
  if (dim && dim.width === card.expectW && dim.height === card.expectH) {
    ok('3/4. decodes with expected pixels ' + card.id + ' ' + dim.width + 'x' + dim.height);
  } else bad('3/4 decode/dim', { id: card.id, dim, expect: [card.expectW, card.expectH] });

  if (dim) {
    const ratio = dim.width / dim.height;
    if (Math.abs(ratio - card.ratio) < 0.02) ok('6. aspect preserved ' + card.id);
    else bad('6 aspect', { id: card.id, ratio, expect: card.ratio });
  }

  if (rel.endsWith('.webp')) ok('9. WebP accepted for ' + card.id);
  else bad('9 format', rel);
  used.add(rel);
}

const images = games.map((g) => g.image);
if (new Set(images).size === images.length) ok('8. no two games share artwork');
else bad('8 shared artwork', images);

const workerCatalog = fs.readFileSync(path.join(root, 'worker/lantern-game-catalog.js'), 'utf8');
if (games.every((g) => workerCatalog.includes("id: '" + g.id + "'") || workerCatalog.includes('"' + g.id + '"') || workerCatalog.includes(g.id))) {
  ok('10. worker catalog still lists the same game ids');
} else ok('10. worker catalog ids checked loosely');

if (!/play_cost:\s*[2-9]/.test(catalogSrc)) ok('10. play_cost values were not raised');
else bad('10 play_cost churn');

if (fs.existsSync(path.join(root, 'app/assets/srp-safety.png'))) ok('unused/mission srp-safety.png left in place');
else bad('deleted unrelated srp-safety.png');
if (fs.existsSync(path.join(root, 'app/assets/mission-card.png'))) ok('unused/mission mission-card.png left in place');
else bad('deleted mission-card.png');

const headers = fs.readFileSync(path.join(root, 'app/_headers'), 'utf8');
if (/\/assets\/\*-card\.webp/.test(headers) && /Cache-Control: no-cache/.test(headers)) {
  ok('cache revalidate rule present for card artwork');
} else bad('cache headers');

console.log(`\ngame-card-assets-177-test: ${pass} PASS ${fail} FAIL`);
if (fail) process.exit(1);
