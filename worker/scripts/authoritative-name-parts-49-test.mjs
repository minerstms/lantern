/**
 * Prompt #49 — Lantern must not re-split TMS first/last when parts exist.
 * Usage: node worker/scripts/authoritative-name-parts-49-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renameAuthoritativeStudent, STUDENT_RENAME_REVISION } from '../admin-student-rename.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const lanternSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const renameSrc = fs.readFileSync(path.join(root, 'worker/admin-student-rename.js'), 'utf8');

if (lanternSrc.includes('function rosterNamePartsFromRow') && /const names = rosterNamePartsFromRow\(s\)/.test(lanternSrc)) {
  ok('roster list prefers TMS first/last instead of always splitting');
} else bad('list still always splits');
if (renameSrc.includes('rosterNamePartsFromBridge') && !/const names = splitDisplayName\(authoritativeName\)/.test(renameSrc)) {
  ok('rename helper uses TMS parts, not a re-split of student_name');
} else bad('rename still splits');
if (adminHtml.includes('function rosterNamePartsFromRow') && adminHtml.includes('studentRenamePartsAccepted') && adminHtml.includes('formatNamePartsLine')) {
  ok('Admin Edit prefill + verification use name parts');
} else bad('admin html parts');
if (adminHtml.includes('!namesEqualForSaveProof(first, beforeFirst)') && adminHtml.includes('!namesEqualForSaveProof(last, beforeLast)')) {
  ok('Save treats first/last boundary changes as a name change even when combined string matches');
} else bad('nameChanged parts');

{
  const result = await renameAuthoritativeStudent(null, {}, {
    student_id: '21004',
    first_name: 'Phay Son',
    last_name: 'Khuu',
  }, {
    async callTmsRosterBridge() {
      return {
        ok: true,
        verified: true,
        student_id: '21004',
        before_name: 'Phay Son Khuu',
        requested_name: 'Phay Son Khuu',
        authoritative_name: 'Phay Son Khuu',
        first_name: 'Phay Son',
        last_name: 'Khuu',
        changes: 1,
      };
    },
  });
  if (
    result.ok &&
    result.verified &&
    result.revision === STUDENT_RENAME_REVISION &&
    result.first_name === 'Phay Son' &&
    result.last_name === 'Khuu' &&
    result.student_name === 'Phay Son Khuu'
  ) {
    ok('21004 helper returns Phay Son | Khuu without splitting student_name');
  } else bad('21004 helper', result);
}

{
  const result = await renameAuthoritativeStudent(null, {}, {
    student_id: '21004',
    first_name: 'Phay Son',
    last_name: 'Khuu',
  }, {
    async callTmsRosterBridge() {
      return {
        ok: true,
        verified: true,
        student_id: '21004',
        authoritative_name: 'Phay Son Khuu',
        first_name: 'Phay',
        last_name: 'Son Khuu',
        changes: 1,
      };
    },
  });
  if (!result.ok && result.verified !== true) {
    ok('helper refuses success when TMS parts were re-split');
  } else bad('refuse split parts', result);
}

console.log('\nauthoritative-name-parts-49-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
