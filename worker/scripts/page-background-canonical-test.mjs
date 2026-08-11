/**
 * Prompt #156 — ordinary Lantern pages use canonical --lantern-page-bg from lantern-header.css.
 * Usage: node worker/scripts/page-background-canonical-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'app');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const headerCss = fs.readFileSync(path.join(app, 'css', 'lantern-header.css'), 'utf8');
assert(
  /--lantern-page-bg\s*:/.test(headerCss) && /--lantern-page-bg-color\s*:/.test(headerCss),
  '1. lantern-header.css defines --lantern-page-bg tokens'
);
assert(
  /radial-gradient\(1200px 600px at 50% 0%,\s*#0b244f/.test(headerCss)
    && /radial-gradient\(900px 500px at 20% 30%,\s*rgba\(46,\s*105,\s*214/.test(headerCss)
    && /linear-gradient\(180deg,\s*#070b12,\s*#05070b\)/.test(headerCss),
  '2. canonical token matches Play radial stack exactly'
);
assert(
  /body\s*\{[^}]*background:\s*var\(--lantern-page-bg\)/s.test(headerCss),
  '3. lantern-header.css body uses var(--lantern-page-bg)'
);

const profileCss = fs.readFileSync(path.join(app, 'css', 'lantern-profile-page.css'), 'utf8');
const storeCss = fs.readFileSync(path.join(app, 'css', 'lantern-store-panel.css'), 'utf8');
assert(/var\(--lantern-page-bg\)/.test(profileCss), '4. Locker profile-page reuses --lantern-page-bg (unchanged visual stack)');
assert(/var\(--lantern-page-bg\)/.test(storeCss), '5. Locker store-panel reuses --lantern-page-bg (unchanged visual stack)');

const ordinaryPages = [
  ['explore.html', 'Explore'],
  ['contribute.html', 'Create'],
  ['missions.html', 'Missions'],
  ['teacher.html', 'Teacher Tools'],
  ['games.html', 'Play'],
  ['locker.html', 'Locker'],
  ['admin.html', 'Admin'],
  ['login.html', 'Login'],
  ['grades.html', 'Grades'],
  ['staff.html', 'Staff'],
  ['home.html', 'Home'],
];

for (const [file, label] of ordinaryPages) {
  const html = fs.readFileSync(path.join(app, file), 'utf8');
  assert(
    /href=["']css\/lantern-header\.css["']/.test(html),
    `${label}: loads lantern-header.css`
  );
  const hasFlatBlackBody =
    /body\s*\{[^}]*background:\s*linear-gradient\(\s*180deg\s*,\s*#070b12\s*,\s*#05070b\s*\)/s.test(html)
    || /body\s*\{[^}]*background:\s*#0b1220\b/s.test(html)
    || /body\s*\{[^}]*background:\s*#05070b\b/s.test(html)
    || /body\s*\{[^}]*background:\s*#000\b/s.test(html);
  assert(!hasFlatBlackBody, `${label}: no flat near-black body background override`);

  const hasDuplicatedPlayStack =
    /body\s*\{[^}]*radial-gradient\(\s*1200px 600px at 50% 0%/s.test(html);
  assert(!hasDuplicatedPlayStack, `${label}: no duplicated Play radial stack on body (use shared token)`);
}

const displayHtml = fs.readFileSync(path.join(app, 'display.html'), 'utf8');
assert(
  /radial-gradient\(\s*1400px 700px/.test(displayHtml),
  'Display: keeps special page-local background (exempt)'
);
assert(
  !/var\(--lantern-page-bg\)/.test(displayHtml.replace(/lantern-header\.css/g, '')),
  'Display: does not force ordinary --lantern-page-bg into page CSS'
);

const gamePlayerCss = fs.readFileSync(path.join(app, 'css', 'lantern-game-player.css'), 'utf8');
assert(/background:\s*#070b12/.test(gamePlayerCss), 'Game player canvas keeps its own #070b12 (exempt)');

console.log('\npage-background-canonical-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
