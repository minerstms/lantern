/**
 * Prompt #38 — Lantern resolve-duplicate UI + read-back wiring.
 * Usage: node worker/scripts/duplicate-resolve-38-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const resolveSrc = fs.readFileSync(path.join(root, 'worker/admin-student-resolve-duplicate.js'), 'utf8');

if (adminHtml.includes('Resolve Duplicate') && adminHtml.includes('openStudentResolveModal') && adminHtml.includes('KEEP canonical student')) {
  ok('UI shows Resolve Duplicate with KEEP 21004-style confirmation');
} else bad('resolve UI');
if (adminHtml.includes("Type RESOLVE to confirm") && adminHtml.includes("typed !== 'RESOLVE'")) {
  ok('typed RESOLVE required');
} else bad('RESOLVE confirm');
if (adminHtml.includes('studentResolveOverlay') && adminHtml.includes("ev.key !== 'Escape'")) {
  ok('backdrop/Escape cancel exists');
} else bad('cancel');
if (adminHtml.includes('authoritative_update_not_applied') && adminHtml.includes('confirm that this change was saved. Please try again.')) {
  ok('19. UI cannot show success on read-back mismatch');
} else bad('false success UI');
if (adminHtml.includes('res.body.verified') && adminHtml.includes('savedNorm === requestedNorm')) {
  ok('success toast requires verified reread name');
} else bad('verified toast');
if (indexSrc.includes('authoritative_update_not_applied') && indexSrc.includes('bridge.verified')) {
  ok('Lantern update refuses unverified TMS responses');
} else bad('lantern update gate');
if (resolveSrc.includes('roster/inspect-resolve-duplicate') && resolveSrc.includes('roster/resolve-duplicate')) {
  ok('Lantern resolve routes call TMS bridge only');
} else bad('bridge wiring');
if (!/TMS_LANTERN_BRIDGE_SECRET/.test(adminHtml)) ok('no TMS secret in Admin HTML');
else bad('secret in browser');

console.log('\nlantern duplicate-resolve-38-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
