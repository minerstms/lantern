/**
 * Prompt #213 — Shout-Out Recognizing: real person OR free-text group/label.
 * Usage: node worker/scripts/shoutout-recognition-213-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeShoutOutRecognition, RECOGNITION_LABEL_MAX } from '../content-people.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('OK', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else bad(msg);
}

function mockDb(personRow) {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return personRow || null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return {};
        },
      };
    },
  };
}

const contentPeople = fs.readFileSync(path.join(root, 'worker/content-people.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const picker = fs.readFileSync(path.join(root, 'app/js/lantern-people-picker.js'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

assert(/normalizeShoutOutRecognition/.test(contentPeople), '1. helper exported');
assert(RECOGNITION_LABEL_MAX === 100, '2. max length 100');
assert(/normalizeShoutOutRecognition\(db, body\.people, body\.recognition_label\)/.test(worker), '3. news + recognition routes use helper');
assert(/isShoutOut[\s\S]{0,400}normalizeShoutOutRecognition/.test(worker), '4. Student Spotlight shout path');
assert(/\/api\/recognition\/create[\s\S]{0,800}normalizeShoutOutRecognition/.test(worker), '5. teacher recognition path');
assert(/allowFreeText/.test(picker) && /getRecognitionState/.test(picker), '6. picker free-text API');
assert(/allowFreeText:\s*true/.test(contribute) && /recognition_label/.test(contribute), '7. Create Shout-Out free text');
assert(/allowFreeText:\s*true/.test(teacher) && /recognition_label/.test(teacher), '8. Teacher Shout-Out free text');
assert(!/Select who you are recognizing/.test(contribute), '9. Create no longer requires dropdown-only');
assert(!/Select who you are recognizing/.test(teacher), '10. Teacher no longer requires dropdown-only');
assert(/mode:\s*'custom'/.test(contentPeople) && /people:\s*\[\]/.test(contentPeople), '11. custom mode stores empty people');
assert(!/fuzzyMatch|levenshtein|backfill.*person/.test(contentPeople), '12. no fuzzy person invent');

{
  const a = await normalizeShoutOutRecognition(null, [], 'Volleyball Coaches');
  assert(a.ok && a.mode === 'custom' && a.people.length === 0, 'A. Volleyball Coaches typed only');

  const b = await normalizeShoutOutRecognition(null, [], 'TMS Volleyball');
  assert(b.ok && b.mode === 'custom', 'C. TMS Volleyball custom team');

  const blank = await normalizeShoutOutRecognition(null, [], '  ');
  assert(!blank.ok, 'E. blank rejected');

  const fake = await normalizeShoutOutRecognition(
    mockDb(null),
    [{ token: 'student:not-real', relationship: 'recognized' }],
    'Volleyball Coaches'
  );
  assert(!fake.ok, 'F. fake token rejected (no fake relationship)');

  const person = await normalizeShoutOutRecognition(
    mockDb({
      mtss_student_id: '42',
      display_name: 'Rick Radle',
      identity_display: 'Rick Radle',
      is_active: 1,
    }),
    [{ token: 'student:42', relationship: 'recognized' }],
    ''
  );
  assert(person.ok && person.mode === 'person' && person.people[0].person_key === '42', 'A. Rick selected → canonical');

  const long = await normalizeShoutOutRecognition(null, [], 'x'.repeat(200));
  assert(long.ok && long.recognition_label.length === 100, 'max length trimmed to 100');
}

assert(/Recognizing:\s*'\s*\+\s*shoutRecognitionLabel/.test(worker) || /Recognizing:\s*" \+ shoutRecognitionLabel/.test(worker) || /'Recognizing: '\s*\+\s*shoutRecognitionLabel/.test(worker), '13. Explore body Recognizing prefix for custom/person label');

console.log('\nshoutout-recognition-213-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
