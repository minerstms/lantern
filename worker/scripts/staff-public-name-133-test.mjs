/**
 * Prompt #133 — Canonical professional staff names on public Lantern content.
 * Usage: node worker/scripts/staff-public-name-133-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  formatPublicStaffName,
  formatTickerStaffName,
  validateStaffHonorific,
  buildStaffPublicNameIndex,
  resolveAuthorPublicLabel,
  attachAuthorPublicLabels,
  attachRecognizedStaffPublicLabels,
  overlayNewsRowRecognizedStaff,
  overlayRecognitionListRow,
  rewriteRecognizingLine,
  resolveStaffRowByPersonKey,
} from '../staff-public-name.js';
import { privacySafeStaffLabel, privacySafeStudentLabel } from '../content-people.js';
import { normalizePollRow, normalizeNewsRow, normalizeShoutOutRow } from '../feed-handlers.js';

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
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const rick = {
  username: 'rick.radle',
  first_name: 'Rick',
  last_name: 'Radle',
  display_name: 'Rick Radle',
  honorific: 'Mr.',
  public_display_name: null,
  role: 'teacher',
  staff_id: 4,
};
const kristina = {
  username: 'kristina.vezzani',
  first_name: 'Kristina',
  last_name: 'Vezzani',
  display_name: 'Kristina Vezzani',
  honorific: 'Mrs.',
  public_display_name: null,
  role: 'teacher',
  staff_id: 18,
};
const missingHon = {
  username: 'amanda.cooper',
  first_name: 'Amanda',
  last_name: 'Cooper',
  display_name: 'Amanda Cooper',
  honorific: null,
  public_display_name: null,
  role: 'teacher',
  staff_id: 7,
};
const coachOverride = {
  username: 'eric.colorado',
  first_name: 'Eric',
  last_name: 'Colorado',
  display_name: 'Eric Colorado',
  honorific: 'Mr.',
  public_display_name: 'Coach Colorado',
  role: 'teacher',
  staff_id: 13,
};
const student = {
  username: 'lucas.radle',
  display_name: 'Lucas Radle',
  role: 'student',
};

assert(formatPublicStaffName(rick) === 'Mr. Radle', '1. Rick Radle + Mr. → Mr. Radle');
assert(formatPublicStaffName(kristina) === 'Mrs. Vezzani', '2. Kristina Vezzani + Mrs. → Mrs. Vezzani');
assert(formatTickerStaffName(kristina) === formatPublicStaffName(kristina), '7a. ticker alias is the same helper');
assert(formatTickerStaffName(coachOverride) === 'Coach Colorado', '7b. ticker preserves stored Coach Colorado override');

const idx = buildStaffPublicNameIndex([rick, kristina, missingHon, coachOverride], [
  { lantern_username: 'kristina.vezzani', tms_staff_id: 'Vezzani', is_primary: 1 },
  { lantern_username: 'rick.radle', tms_staff_id: 'Radle', is_primary: 1 },
]);
assert(resolveStaffRowByPersonKey(idx, 'Vezzani') === kristina, '4a. durable TMS person_key resolves');
assert(formatPublicStaffName(resolveStaffRowByPersonKey(idx, 'Vezzani')) === 'Mrs. Vezzani', '4b. current professional label');

const historical = {
  id: 'news:news-99563196-8356-498e-aff1-fb9bfcf5f6a0',
  type: 'shout_out',
  title: 'Thank you, Counselor!',
  body: 'Recognizing: Kristina Vezzani\n\nThank you, Mrs. Vezzani, for the long hours getting all of us ready for school!',
  summary: 'Recognizing: Kristina Vezzani\n\nThank you, Mrs. Vezzani',
  authorId: 'rick.radle',
  authorDisplayName: 'Rick Radle',
  authorRole: 'teacher',
  contentSlot: { newsId: 'news-99563196-8356-498e-aff1-fb9bfcf5f6a0' },
};
const peopleByContent = new Map();
peopleByContent.set('news|news-99563196-8356-498e-aff1-fb9bfcf5f6a0', [
  {
    person_kind: 'staff',
    person_key: 'Vezzani',
    relationship: 'recognized',
    display_label: 'Kristina Vezzani',
  },
]);
attachAuthorPublicLabels([historical], idx);
attachRecognizedStaffPublicLabels([historical], idx, peopleByContent);
assert(historical.authorPublicLabel === 'Mr. Radle', '1b. shout-out author uses Mr. Radle');
assert(historical.contentSlot.recipient === 'Mrs. Vezzani', '3a. recognized slot is Mrs. Vezzani');
assert(/^Recognizing:\s*Mrs\. Vezzani/m.test(historical.body), '3b. Recognizing line rewritten');
assert(!/Recognizing:\s*Kristina Vezzani/i.test(historical.body), '3c. Kristina Vezzani no longer in Recognizing line');
assert(/Thank you, Mrs\. Vezzani/.test(historical.body), '3d. body copy Mrs. Vezzani preserved');
assert(historical.people[0].label === 'Mrs. Vezzani', '4c. people label uses current professional name');

const newsOverlay = overlayNewsRowRecognizedStaff(
  {
    title: 'Shout-Out!: Kristina Vezzani',
    body: 'Recognizing: Kristina Vezzani\n\nThank you, Mrs. Vezzani, for the long hours.',
  },
  idx,
  peopleByContent.get('news|news-99563196-8356-498e-aff1-fb9bfcf5f6a0')
);
assert(newsOverlay.body.indexOf('Recognizing: Mrs. Vezzani') === 0, '4d. news API overlay Recognizing');
assert(newsOverlay.title === 'Shout-Out!: Mrs. Vezzani', '4e. title snapshot replaced only via durable key');
assert(newsOverlay.recognition_public_label === 'Mrs. Vezzani', '4f. recognition_public_label');

const freeText = {
  id: 'news:news-free',
  type: 'shout_out',
  title: 'Go team',
  body: 'Recognizing: Volleyball Coaches\n\nGreat season.',
  contentSlot: { newsId: 'news-free' },
};
attachRecognizedStaffPublicLabels([freeText], idx, new Map());
assert(freeText.body.indexOf('Recognizing: Volleyball Coaches') === 0, '6hist. free-text Recognizing unchanged');

const pollItem = normalizePollRow(
  {
    id: 'poll-1',
    question: 'Spirit day?',
    choices_json: '["Yes","No"]',
    character_name: 'staff:rick.radle',
    created_at: '2026-08-12T00:00:00.000Z',
    approved_at: '2026-08-12T00:00:00.000Z',
  },
  'https://example.test'
);
attachAuthorPublicLabels([pollItem], idx);
assert(pollItem.authorId === 'rick.radle', '5a. staff poll author_id from staff: key');
assert(pollItem.authorRole === 'staff', '5b. staff poll role');
assert(pollItem.authorPublicLabel === 'Mr. Radle', '5c. staff-authored poll professional label');

const studentPoll = normalizePollRow(
  {
    id: 'poll-2',
    question: 'Pizza?',
    choices_json: '["Yes"]',
    character_name: 'Lucas Radle',
    created_at: '2026-08-12T00:00:00.000Z',
    approved_at: '2026-08-12T00:00:00.000Z',
  },
  'https://example.test'
);
attachAuthorPublicLabels([studentPoll], idx);
assert(studentPoll.authorRole === 'student', '9a. student poll role unchanged');
assert(studentPoll.authorPublicLabel == null, '9b. student poll gets no staff public label');

const missionItems = [
  { authorId: 'rick.radle', authorRole: 'staff', authorDisplayName: 'staff:rick.radle' },
];
attachAuthorPublicLabels(missionItems, idx);
assert(missionItems[0].authorPublicLabel === 'Mr. Radle', '6. staff mission/public contribution uses Mr. Radle');

const recRow = overlayRecognitionListRow(
  { character_name: 'Kristina Vezzani', created_by_teacher_id: 'rick.radle', created_by_teacher_name: 'Rick Radle' },
  idx,
  [{ person_kind: 'staff', person_key: 'Vezzani', relationship: 'recognized', display_label: 'Kristina Vezzani' }]
);
assert(recRow.character_public_label === 'Mrs. Vezzani', '7c. recognition list public label');
assert(recRow.created_by_teacher_public_label === 'Mr. Radle', '7d. recognition author public label');
assert(recRow.character_name === 'Kristina Vezzani', '7e. stored character_name not rewritten');

const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const marqueeEventsJs = fs.readFileSync(path.join(root, 'worker/marquee-events.js'), 'utf8');
assert(
  /overlayRecognitionListRow/.test(marqueeEventsJs) && /character_public_label/.test(marqueeEventsJs),
  '7f. marquee applies character_public_label server-side (ticker no longer reads recognition/list)'
);
assert(
  /\/api\/marquee\/events/.test(tickerJs) && !/fallbackRecognitionNews/.test(tickerJs),
  '7g. ticker uses canonical marquee events (professional names already in public_text)'
);
assert(/formatTickerStaffName/.test(fs.readFileSync(path.join(root, 'worker/staff-public-name.js'), 'utf8')), '7h. marquee helper exported');

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
assert(/u\.display_name/.test(adminHtml) && /u\.first_name/.test(adminHtml), '8. Admin Staff still uses full account name fields');

assert(privacySafeStudentLabel(student) === 'Lucas Radle', '9c. student privacySafe label unchanged');
assert(privacySafeStaffLabel(kristina) === 'Mrs. Vezzani', '9d. staff picker uses professional label');

assert(validateStaffHonorific('Ms.', { required: false }).ok === true, '10a. explicit Ms. still valid');
assert(validateStaffHonorific('Dr.', { required: false }).ok === false, '10b. Dr. is not inferred or auto-accepted');
assert(formatPublicStaffName(missingHon) === 'Cooper', '10c. missing honorific → last name only');
assert(formatPublicStaffName(missingHon) !== 'Amanda Cooper', '10d. no first+last fallback');
assert(formatPublicStaffName(missingHon) !== 'Ms. Cooper', '10e. no guessed Ms.');
assert(formatPublicStaffName(missingHon) !== 'Mrs. Cooper', '10f. no guessed Mrs.');
assert(formatPublicStaffName({ first_name: 'Pat', last_name: 'Smith', display_name: 'Pat Smith', honorific: null, role: 'teacher' }) === 'Smith', '10g. no gender/first-name heuristic');
assert(
  formatPublicStaffName({ display_name: 'Rick Radle', first_name: null, last_name: null, honorific: null, role: 'teacher' }) === 'Rick Radle',
  '10h. last_name absent uses stored display_name (no inferred honorific)'
);

const newsRow = normalizeNewsRow(
  {
    id: 'news-99563196-8356-498e-aff1-fb9bfcf5f6a0',
    title: 'Thank you, Counselor!',
    body: 'Recognizing: Kristina Vezzani\n\nThank you, Mrs. Vezzani, for the long hours getting all of us ready for school!',
    actor_id: 'rick.radle',
    author_name: 'Rick Radle',
    author_type: 'teacher',
    category: 'Student Spotlight',
    created_at: '2026-08-11T21:25:28.197Z',
    reviewed_at: '2026-08-11T21:25:28.197Z',
  },
  'https://example.test'
);
attachAuthorPublicLabels([newsRow], idx);
attachRecognizedStaffPublicLabels([newsRow], idx, peopleByContent);
assert(newsRow.type === 'shout_out', '3e. news shout-out type');
assert(newsRow.authorPublicLabel === 'Mr. Radle', '3f. news shout-out author');
assert(!/Kristina Vezzani/.test(newsRow.body.replace(/Thank you, Mrs\. Vezzani[\s\S]*/, '')), '3g. metadata line cleared of first+last');

const shoutTeacher = normalizeShoutOutRow(
  {
    id: 'rec-1',
    character_name: 'Kristina Vezzani',
    message: 'Thank you, Mrs. Vezzani!',
    created_by_teacher_id: 'rick.radle',
    created_by_teacher_name: 'Rick Radle',
    created_at: '2026-08-11T21:25:28.197Z',
  },
  'https://example.test'
);
attachAuthorPublicLabels([shoutTeacher], idx);
const recPeople = new Map();
recPeople.set('recognition|rec-1', [
  { person_kind: 'staff', person_key: 'Vezzani', relationship: 'recognized', display_label: 'Kristina Vezzani' },
]);
attachRecognizedStaffPublicLabels([shoutTeacher], idx, recPeople);
assert(shoutTeacher.authorPublicLabel === 'Mr. Radle', '3h. teacher recognition author');
assert(shoutTeacher.contentSlot.recipient === 'Mrs. Vezzani', '3i. teacher recognition recipient overlay');

const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const sandbox = {
  console,
  document: {
    createElement() {
      return { style: {}, classList: { add() {} }, setAttribute() {}, appendChild() {}, querySelector() { return null; } };
    },
  },
  window: undefined,
  LanternMedia: undefined,
  LANTERN_AVATAR_API: '',
  location: { href: '' },
  open() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(cardsJs, sandbox);
const LC = sandbox.LanternCards;
const face = LC.normalizeFeedItemToFaceModel(historical);
const html = LC.buildCanonicalCardFaceHtml(face);
assert(LC.shoutOutRecognizedPartyLabel(historical) === 'Mrs. Vezzani', '3j. compact card recognized party');
assert(/Mrs\. Vezzani/.test(html), '3k. Explore card html shows Mrs. Vezzani');
assert(!/Kristina Vezzani/.test(html), '3l. Explore card html hides Kristina Vezzani');
assert(LC.formatExploreAuthorLabel(face) === 'Mr. Radle', '3m. Explore author Mr. Radle');
assert(LC.formatCompactAuthor('Lucas Radle') === 'Lucas R.', '9e. student compact First L. unchanged');

assert(rewriteRecognizingLine('Recognizing: Kristina Vezzani\n\nHi', 'Mrs. Vezzani') === 'Recognizing: Mrs. Vezzani\n\nHi', '4g. rewrite helper');

const feedJs = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
assert(/attachRecognizedStaffPublicLabels/.test(feedJs), 'patch. feed wires recognized overlay');
assert(/loadContentPeopleIndex/.test(feedJs), 'patch. feed loads durable people keys');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
