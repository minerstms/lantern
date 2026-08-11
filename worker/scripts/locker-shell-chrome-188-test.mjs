/**
 * Prompt #188 — Locker profile shell: no thin outline, no heavy blue top divider.
 * Usage: node worker/scripts/locker-shell-chrome-188-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const lockerHtml = read('app/locker.html');
const surfaceCss = read('app/css/lantern-surface-theme.css');
const exploreHtml = read('app/explore.html');

assert(/Prompt #188[\s\S]{0,120}box-shadow:\s*none/.test(surfaceCss), '1. themed Locker surface outline removed');
assert(
  !/\.lanternLockerSurface\.lanternLockerSurface--themed\s*\{[^}]*inset 0 0 0 1px/.test(surfaceCss),
  '2. old 1px inset outline rule gone'
);

assert(
  !/\.wrap\.lanternContent \[data-locker-surface\]:not\(\[hidden\]\)\s*\{[^}]*inset 0 3px 0 0 var\(--accent\)/.test(lockerHtml),
  '3. generic 3px accent top bar removed'
);
assert(
  /data-locker-surface="overview"[\s\S]{0,80}box-shadow:\s*none/.test(lockerHtml),
  '4. Overview panel has no chrome outline/divider'
);
assert(/lockerProfileHeader/.test(lockerHtml), '5. profile header host preserved');
assert(/feedHeading--lockerCompact/.test(lockerHtml), '6. My Lantern compact row preserved');
assert(/lockerOptions/.test(lockerHtml), '7. Locker Options styles preserved');

assert(/data-surface-context="explore"/.test(exploreHtml), '8. Explore surface markup unchanged by Locker chrome cleanup');
assert(
  !/lanternLockerSurface--themed/.test(exploreHtml),
  '9. Explore does not use Locker themed outline class'
);

console.log('\nlocker-shell-chrome-188-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
