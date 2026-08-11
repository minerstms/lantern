/**
 * Prompt #170 — real staff import mapping + email migration guards (static).
 * Usage: node worker/scripts/import-real-staff-170-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REAL_STAFF_ROSTER,
  matchLanternAccount,
  matchTmsStaff,
  planPerson,
  buildApplySql,
} from './import-real-staff-170.mjs';
import { validateStaffEmail } from '../admin-account-utils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const migration = fs.readFileSync(path.join(root, 'worker/migrations/060_lantern_pilot_accounts_email.sql'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const indexJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const utils = fs.readFileSync(path.join(root, 'worker/admin-account-utils.js'), 'utf8');

assert(REAL_STAFF_ROSTER.length === 31, 'roster has 31 people');
assert(REAL_STAFF_ROSTER.every((p) => p.username === p.username.toLowerCase()), 'usernames lowercase');
assert(REAL_STAFF_ROSTER.find((p) => p.username === 'theresa.sanchez'), 'Theresa → theresa.sanchez');
const jackie = REAL_STAFF_ROSTER.find((p) => p.display === 'Jackie Lynn');
assert(jackie && jackie.username === 'je.lynn' && jackie.email === 'je.lynn@trinidad.k12.co.us', 'Jackie je.lynn exception');
assert(jackie.first === 'Jacqueline' && jackie.last === 'Lynn', 'Jackie legal first/last');
assert(!REAL_STAFF_ROSTER.some((p) => p.username === 'jackie.lynn' || p.username === 'jacqueline.lynn'), 'no jackie.lynn alias');
assert(REAL_STAFF_ROSTER.every((p) => p.email.endsWith('@trinidad.k12.co.us')), 'school email domain');
assert(new Set(REAL_STAFF_ROSTER.map((p) => p.username)).size === 31, 'unique usernames');
assert(new Set(REAL_STAFF_ROSTER.map((p) => p.email)).size === 31, 'unique emails');

assert(/ADD COLUMN email TEXT/.test(migration), 'migration adds email');
assert(/idx_lantern_pilot_accounts_email/.test(migration), 'email unique index');
assert(/validateStaffEmail/.test(utils) && /validateStaffEmail/.test(indexJs), 'email validation wired');
assert(/editUserEmail/.test(adminHtml) && /nu_email/.test(adminHtml), 'Admin UI email fields');
assert(/staff_id, email, role/.test(indexJs), 'admin list SELECT includes email');
assert(/defer_credentials/.test(indexJs), 'deferred credential create path exists');
const importSrc = fs.readFileSync(path.join(root, 'worker/scripts/import-real-staff-170.mjs'), 'utf8');
assert(/NULL, NULL, NULL, NULL, NULL/.test(importSrc) && /password_hash, password_salt/.test(importSrc), 'import creates NULL password hashes');

const lantern = [
  { username: 'admin', display_name: 'Web Admin', first_name: 'Web', last_name: 'Admin', staff_id: 1, role: 'admin', email: null },
  { username: 'rick.radle', display_name: 'Rick Radle', first_name: 'Rick', last_name: 'Radle', staff_id: 4, role: 'teacher', email: null },
  { username: 'alyssa.glorioso', display_name: 'Alyssa Glorioso', first_name: 'Alyssa', last_name: 'Glorioso', staff_id: 6, role: 'teacher', email: null },
];
const tms = [
  { teacher_id: 'Radle', teacher_name: 'Rick Radle', teacher_email: 'rick.radle@trinidad.k12.co.us' },
  { teacher_id: 'AGlorioso', teacher_name: 'Alyssa Glorioso', teacher_email: 'alyssa.glorioso@trinidad.k12.co.us' },
  { teacher_id: 'Ackerman', teacher_name: 'Ashliegh Ackerman', teacher_email: 'ashliegh.ackerman@trinidad.k12.co.us' },
  { teacher_id: 'BWilson', teacher_name: 'Becky Wilson', teacher_email: 'rebecca.wilson@trinidad.k12.co.us' },
  { teacher_id: 'Gumlich', teacher_name: 'Vinny Gumlich', teacher_email: 'vincent.gumlich@trinidad.k12.co.us' },
];
const links = [{ tms_staff_id: 'Radle', lantern_username: 'admin' }];

const rick = REAL_STAFF_ROSTER.find((p) => p.display === 'Rick Radle');
const rickPlan = planPerson(rick, lantern, tms, links);
assert(rickPlan.lantern && rickPlan.lantern.username === 'admin', 'Rick matches privileged admin');
assert(rickPlan.action === 'UPDATE', 'Rick UPDATE email only when needed');
assert(rickPlan.linkAction === 'unchanged', 'Rick TMS link preserved');

const ashleigh = REAL_STAFF_ROSTER.find((p) => p.username === 'ashleigh.ackerman');
const ashPlan = planPerson(ashleigh, lantern, tms, links);
assert(ashPlan.action === 'CREATE', 'Ashleigh CREATE');
assert(ashPlan.tms.status === 'none' && ashPlan.linkAction === 'unmatched', 'Ashleigh not fuzzy-linked to Ashliegh');

const rebecca = REAL_STAFF_ROSTER.find((p) => p.username === 'rebecca.wilson');
const rebPlan = planPerson(rebecca, lantern, tms, links);
assert(rebPlan.tms.status === 'exact' && rebPlan.tms.row.teacher_id === 'BWilson', 'Rebecca links by exact email');

const vincent = REAL_STAFF_ROSTER.find((p) => p.username === 'vincent.gumlich');
const vinPlan = planPerson(vincent, lantern, tms, links);
assert(vinPlan.tms.status === 'exact' && vinPlan.tms.row.teacher_id === 'Gumlich', 'Vincent links by exact email');

const sql = buildApplySql([rickPlan, ashPlan, rebPlan, vinPlan]);
assert(/UPDATE lantern_pilot_accounts/.test(sql) && /admin/.test(sql), 'SQL updates admin');
assert(!/password_hash\s*=/.test(sql), 'SQL never rewrites password_hash');
assert(/password_hash, password_salt[\s\S]*NULL, NULL/.test(sql), 'CREATE leaves passwords NULL');
assert(!/INSERT INTO tms_identity_links[\s\S]*Radle/.test(sql), 'does not duplicate Rick link');
assert(/INSERT INTO tms_identity_links[\s\S]*BWilson/.test(sql), 'creates Rebecca link');

assert(validateStaffEmail('rick.radle@trinidad.k12.co.us').ok, 'validate ok email');
assert(!validateStaffEmail('not-an-email').ok, 'validate rejects junk');
assert(validateStaffEmail('').value === null, 'empty email clears');

assert(matchLanternAccount(rick, lantern).row.username === 'admin', 'match prefers admin privileged account');
assert(matchTmsStaff(ashleigh, tms).status === 'none', 'no fuzzy TMS name match');

console.log('\nimport-real-staff-170-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
