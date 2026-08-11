/**
 * Prompt #155 — Lantern favicon wiring regression (string + ICO binary checks).
 * Usage: node worker/scripts/favicon-wiring-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const srcPng = path.join(root, 'assets', 'favicon.png');
const appPng = path.join(root, 'app', 'assets', 'favicon.png');
const appIco = path.join(root, 'app', 'favicon.ico');

assert(fs.existsSync(srcPng), '1. assets/favicon.png source exists');
assert(fs.existsSync(appPng), '1b. app/assets/favicon.png deployed source exists');
assert(fs.existsSync(appIco), '2. app/favicon.ico exists');

const ico = fs.readFileSync(appIco);
assert(ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0, '2b. favicon.ico is genuine ICO (reserved=0 type=1)');
const count = ico.readUInt16LE(4);
assert(count >= 3, '3. ICO contains multiple images', count);
const dims = [];
for (let i = 0; i < count; i++) {
  const off = 6 + i * 16;
  const w = ico[off] === 0 ? 256 : ico[off];
  const h = ico[off + 1] === 0 ? 256 : ico[off + 1];
  dims.push([w, h]);
}
assert(dims.some((d) => d[0] === 16 && d[1] === 16), '3b. ICO has 16×16', JSON.stringify(dims));
assert(dims.some((d) => d[0] === 32 && d[1] === 32), '3c. ICO has 32×32', JSON.stringify(dims));
assert(dims.some((d) => d[0] === 48 && d[1] === 48), '3d. ICO has 48×48', JSON.stringify(dims));

const requiredPages = [
  'explore.html',
  'teacher.html',
  'games.html',
  'missions.html',
  'contribute.html',
  'create.html',
  'locker.html',
  'login.html',
  'change-password.html',
  'setup.html',
  'display.html',
  'admin.html',
];

for (const page of requiredPages) {
  const html = fs.readFileSync(path.join(root, 'app', page), 'utf8');
  assert(html.includes('href="/favicon.ico"'), `${page}: references /favicon.ico`);
  assert(html.includes('/assets/favicon.png?v=2'), `${page}: versioned PNG favicon`);
  assert(html.includes('rel="apple-touch-icon"'), `${page}: apple-touch-icon`);
  assert(!/favicon\.(svg|gif)|old-favicon|icon-legacy/i.test(html), `${page}: no stale favicon refs`);
}

const allHtml = fs.readdirSync(path.join(root, 'app')).filter((f) => f.endsWith('.html'));
for (const page of allHtml) {
  const html = fs.readFileSync(path.join(root, 'app', page), 'utf8');
  assert(html.includes('href="/favicon.ico"') && html.includes('/assets/favicon.png?v=2'), `all entry HTML wired: ${page}`);
}

assert(!fs.existsSync(path.join(root, 'app', 'manifest.webmanifest')), 'PWA: no Lantern webmanifest present (icons intentionally unchanged)');
assert(!fs.existsSync(path.join(root, 'app', 'manifest.json')), 'PWA: no manifest.json');

console.log('\nfavicon-wiring-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
