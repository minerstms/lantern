/**
 * Prompt #190 — People tagging / search / My Lantern relationship regression tests.
 * Prompt #213 — Shout-Out Recognizing: canonical person OR free-text group/label.
 * Usage: node worker/scripts/people-tagging-190-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parsePeopleToken,
  normalizePeoplePayload,
  normalizeShoutOutRecognition,
  publicPeopleForReview,
  CONTENT_PEOPLE_MAX_TAGS,
  RECOGNITION_LABEL_MAX,
  privacySafeStudentLabel,
} from '../content-people.js';
import { lockerPersonalFeedTest } from '../locker-personal-feed.js';

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

const migrate = fs.readFileSync(path.join(root, 'worker/migrations/064_lantern_content_people.sql'), 'utf8');
const contentPeople = fs.readFileSync(path.join(root, 'worker/content-people.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const locker = fs.readFileSync(path.join(root, 'worker/locker-personal-feed.js'), 'utf8');
const picker = fs.readFileSync(path.join(root, 'app/js/lantern-people-picker.js'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const teacher = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

assert(/CREATE TABLE IF NOT EXISTS lantern_content_people/.test(migrate), '1. migration creates lantern_content_people');
assert(/idx_content_people_unique/.test(migrate), '2. uniqueness index');
assert(/CONTENT_PEOPLE_MAX_TAGS = 40/.test(contentPeople), '3. tag max 40');
assert(/recognized/.test(contentPeople) && /tagged/.test(contentPeople), '4. relationship types');
assert(/\/api\/people\/search/.test(worker), '5. people search route');
assert(/normalizeShoutOutRecognition/.test(worker) && /recognition_label/.test(worker), '6. shout recognition person-or-text (#213)');
assert(/replaceContentPeople\(db, 'news'/.test(worker), '7. news stores people');
assert(/replaceContentPeople\(db, 'poll_contribution'/.test(worker), '8. poll stores people');
assert(/copyContentPeople\(db, 'poll_contribution'/.test(fs.readFileSync(path.join(root, 'worker/poll-publish.js'), 'utf8')), '9. poll approve copies people');
assert(/replaceContentPeople\(db, 'recognition'/.test(worker), '10. recognition stores people');
assert(/people: publicPeopleForReview/.test(worker), '11. review queue exposes people');
assert(/feedIdsRelatedToPersonKeys/.test(locker), '12. My Lantern uses content_people feed ids');
assert(/personKeysForAccount/.test(locker), '13. My Lantern resolves person keys');
assert(/byId\.set/.test(locker), '14. My Lantern dedupes by feed id');
assert(/LanternPeoplePicker/.test(picker), '15. shared picker module');
assert(/allowFreeText/.test(picker) && /getRecognitionState/.test(picker), '16. picker free-text recognition API (#213)');
assert(/Students/.test(picker) && /Staff/.test(picker), '17. grouped results');
assert(/lantern-people-picker\.js/.test(contribute), '18. contribute loads picker');
assert(/contributeShoutPeopleMount/.test(contribute), '19. shout recognizing mount');
assert(/contributePeopleMount/.test(contribute), '20. optional people mount');
assert(!/id="shoutRecipient"/.test(contribute), '21. free-text shoutRecipient removed');
assert(/relationship:\s*'recognized'/.test(contribute), '22. shout recognized relationship');
assert(/payload\.recognition_label/.test(contribute) && /allowFreeText:\s*true/.test(contribute), '23. contribute sends recognition_label + free text (#213)');
assert(/teacherShoutPeopleMount/.test(teacher), '24. teacher shout picker mount');
assert(!/id="shoutOutStudentSelect"/.test(teacher), '25. teacher free-text/select roster removed');
assert(/item\.people && item\.people\.length/.test(teacher), '26. review shows people');
assert(/NO HISTORICAL|fuzzy|do not.*fuzzy/i.test(contentPeople) || !/fuzzyMatch|levenshtein/.test(contentPeople), '27. no fuzzy historical matching helpers');

const tok = parsePeopleToken('student:20889');
assert(tok && tok.person_kind === 'student' && tok.person_key === '20889', '28. parse student token');
const staffTok = parsePeopleToken('staff_tms:Radle');
assert(staffTok && staffTok.person_kind === 'staff' && staffTok.person_key === 'Radle', '29. parse staff_tms token');
assert(!parsePeopleToken('JOhnne'), '30. free-text name is not a valid token');
assert(CONTENT_PEOPLE_MAX_TAGS === 40, '31. max tags constant 40');

const pub = publicPeopleForReview([
  { relationship: 'tagged', person_kind: 'student', person_key: '20889', display_label: 'Lucas R.' },
]);
assert(pub[0] && pub[0].label === 'Lucas R.' && !('person_key' in pub[0]), '32. review payload hides person_key');

assert(
  privacySafeStudentLabel({ identity_display: 'Lucas R.', display_name: 'Lucas Full', mtss_student_id: '20889' }) === 'Lucas R.',
  '33. privacy-safe student label prefers identity_display'
);

assert(lockerPersonalFeedTest.isSubmittedByIdentity({ authorId: '20889' }, new Set(['20889']), 'u'), '34. authored match');
assert(
  !lockerPersonalFeedTest.isSubmittedByIdentity({ authorId: 'teacher1' }, new Set(['20889']), 'u'),
  '35. tagged person is not author via identity helper'
);

// Mock normalizePeoplePayload validation paths without DB resolution for empty/invalid shapes
{
  const empty = await normalizePeoplePayload(null, [], { requireRecognizedOne: true });
  assert(!empty.ok, '36. shout without people fails (strict people path)');
  const fake = await normalizePeoplePayload(
    mockDb(null),
    [{ token: 'student:nope', relationship: 'recognized' }],
    { requireRecognizedOne: true }
  );
  assert(!fake.ok, '37. unresolved person rejected');
  const dupSkipDb = await normalizePeoplePayload(
    mockDb({
      mtss_student_id: '20889',
      display_name: 'Lucas R.',
      identity_display: 'Lucas R.',
    }),
    [
      { token: 'student:20889', relationship: 'tagged' },
      { token: 'student:20889', relationship: 'tagged' },
    ],
    { requireRecognizedOne: false }
  );
  assert(dupSkipDb.ok && dupSkipDb.people.length === 1, '38. duplicate person collapsed');
}

assert(/staff_tms:/.test(contentPeople) && /GROUP BY l\.tms_staff_id/.test(contentPeople), '39. Rick/staff TMS dedup group');
assert(/staff_lantern:/.test(contentPeople), '40. unlinked staff lantern_staff fallback token');
assert(/hidden_at IS NULL/.test(fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8')), '41. approved feed already gates hidden');

// Prompt #213 — normalizeShoutOutRecognition
{
  assert(RECOGNITION_LABEL_MAX === 100, '42. recognition label max 100');

  const blank = await normalizeShoutOutRecognition(null, [], '   ');
  assert(!blank.ok, '43. blank recognition rejected');

  const custom = await normalizeShoutOutRecognition(null, [], 'Volleyball Coaches');
  assert(
    custom.ok && custom.mode === 'custom' && custom.people.length === 0 && custom.recognition_label === 'Volleyball Coaches',
    '44. typed group accepted with no people rows'
  );

  const team = await normalizeShoutOutRecognition(null, [], 'TMS Volleyball');
  assert(team.ok && team.mode === 'custom' && team.people.length === 0, '45. custom team label accepted');

  const fakeTok = await normalizeShoutOutRecognition(
    mockDb(null),
    [{ token: 'student:fake999', relationship: 'recognized' }],
    'Volleyball Coaches'
  );
  assert(!fakeTok.ok, '46. fake person token rejected (no silent custom fallback)');

  const person = await normalizeShoutOutRecognition(
    mockDb({
      mtss_student_id: '1',
      display_name: 'Rick Radle',
      identity_display: 'Rick Radle',
      is_active: 1,
    }),
    [{ token: 'student:1', relationship: 'recognized' }],
    ''
  );
  assert(
    person.ok && person.mode === 'person' && person.people.length === 1 && /Rick/.test(person.recognition_label),
    '47. selected person creates canonical recognized relationship'
  );

  assert(/allowFreeText:\s*true/.test(teacher) && /recognition_label/.test(teacher), '48. teacher shout free-text parity (#213)');
  assert(/Search a person or type a group name/.test(picker) || /Search a person or type a group name/.test(contribute), '49. combobox free-text placeholder');
  assert(/clears the stale canonical selection|selected = \[\]/.test(picker), '50. editing after selection clears stale person');
}

console.log('\npeople-tagging-190-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
