/**
 * Semester bulk credentials — CSV match, MonthDDYYYY, admin apply route, login UI.
 * Usage: node worker/scripts/semester-bulk-credentials-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const H = require(path.join(root, 'app/js/lantern-semester-credentials.js'));

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const loginHtml = fs.readFileSync(path.join(root, 'app/login.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}

async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: account.username,
    role: account.role,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function account(overrides) {
  return {
    username: 'admin',
    display_name: 'Web Admin',
    first_name: 'Web',
    last_name: 'Admin',
    role: 'admin',
    is_active: 1,
    must_change_password: 0,
    password_hash: 'OLDHASH',
    password_salt: 'OLDSALT',
    mtss_student_id: null,
    ...overrides,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.mutations = [];
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() {
        return { results: Object.values(state.accounts) };
      },
      async run() {
        if (s.includes('UPDATE lantern_pilot_accounts SET password_hash') && s.includes('must_change_password = 0')) {
          const hash = binds[0];
          const salt = binds[1];
          const resetBy = binds[2];
          const username = String(binds[3] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = {
              ...state.accounts[key],
              password_hash: hash,
              password_salt: salt,
              must_change_password: 0,
              password_reset_by: resetBy,
            };
            state.mutations.push({ username, hash, salt, resetBy });
          }
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET, _state: state };
}

function req(method, path, body, cookie) {
  const headers = { Cookie: cookie || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://lantern.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/* ---------- Password format ---------- */
{
  const a = H.parseDob('10/2/2013');
  if (a && a.password === 'October022013') ok('10/2/2013 → October022013');
  else bad('10/2/2013 → October022013', a && a.password);
  const b = H.parseDob('2/1/2012');
  if (b && b.password === 'February012012') ok('2/1/2012 → February012012');
  else bad('2/1/2012 → February012012', b && b.password);
  if (H.formatBirthdayCredential('2013-10-02') === 'October022013') ok('ISO 2013-10-02 zero-padded day');
  else bad('ISO 2013-10-02 zero-padded day');
  if (H.parseDob('02/01/2012') && H.parseDob('02/01/2012').password === 'February012012') ok('zero-padded US date');
  else bad('zero-padded US date');
  if (!H.parseDob('2/30/2012') && !H.parseDob('13/1/2012') && !H.parseDob('birthday')) ok('invalid DOB rejected');
  else bad('invalid DOB rejected');
}

/* ---------- CSV headers ---------- */
{
  const good = H.parseSemesterCsv('Last Name,First Name,Student Number,Date of Birth\nSmith,Ada,12345,10/2/2013\n');
  if (good.ok && good.rows.length === 1 && good.rows[0].studentNumber === '12345') ok('CSV header validation accepts required columns');
  else bad('CSV header validation accepts required columns');
  const badHeaders = H.parseSemesterCsv('Name,ID,DOB\nAda,12345,10/2/2013\n');
  if (!badHeaders.ok && badHeaders.error === 'invalid_headers') ok('CSV header validation rejects missing columns');
  else bad('CSV header validation rejects missing columns');
}

/* ---------- Matching ---------- */
{
  const users = [
    account({ username: '12345', role: 'student', first_name: 'Ada', last_name: 'Smith', mtss_student_id: '12345' }),
    account({ username: '33333', role: 'student', first_name: 'Ada', last_name: 'Smith', mtss_student_id: '33333' }),
    account({ username: '22222', role: 'student', first_name: 'Ben', last_name: 'Jones', mtss_student_id: '22222', is_active: 0 }),
    account({ username: 'ms_carter', role: 'teacher', first_name: 'Pat', last_name: 'Carter' }),
  ];
  const csv = H.parseSemesterCsv(
    'Last Name,First Name,Student Number,Date of Birth\n' +
    'Smith,Ada,12345,10/2/2013\n' +
    'Wrong,Name,33333,10/2/2013\n' +
    'Ghost,No,99999,10/2/2013\n' +
    'Jones,Ben,22222,2/1/2012\n' +
    'Carter,Pat,ms_carter,10/2/2013\n' +
    'Bad,Date,12346,2/30/2012\n' +
    'Smith,Ada,12345,10/2/2013\n' +
    'Dup,Row,88888,10/2/2013\n' +
    'Dup,Row,88888,10/2/2013\n'
  ).rows;
  const preview = H.previewSemesterCsv(csv, users);
  const byStatus = {};
  preview.rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
  if (preview.totals.duplicates >= 2) ok('duplicates classified');
  else bad('duplicates classified', JSON.stringify(preview.totals));
  if (preview.rows.some((r) => r.studentNumber === '99999' && r.status === 'student_not_found')) ok('Student Number matching reports not found');
  else bad('Student Number matching reports not found');
  if (preview.rows.some((r) => r.status === 'id_match_name_mismatch')) ok('name mismatch rejection');
  else bad('name mismatch rejection');
  if (preview.rows.some((r) => r.status === 'invalid_dob')) ok('invalid DOB status');
  else bad('invalid DOB status');
  if (preview.rows.some((r) => r.studentNumber === '22222' && r.status === 'inactive_or_not_student')) ok('inactive student rejection');
  else bad('inactive student rejection');
  if (preview.rows.some((r) => r.studentNumber === 'ms_carter' && r.status === 'inactive_or_not_student')) ok('non-student rejection');
  else bad('non-student rejection');
  const exact = preview.rows.filter((r) => r.status === 'exact_match');
  if (exact.length === 0 && preview.totals.willUpdate === 0) {
    ok('duplicate 12345 rows are not auto-applied');
  } else {
    bad('duplicate 12345 rows are not auto-applied', JSON.stringify(exact));
  }
}

{
  const users = [
    account({ username: '12345', role: 'student', first_name: 'Ada', last_name: 'Smith', mtss_student_id: '12345' }),
    account({ username: '55555', role: 'student', first_name: 'Cara', last_name: 'Young', mtss_student_id: '55555' }),
  ];
  const csv = H.parseSemesterCsv(
    'Last Name,First Name,Student Number,Date of Birth\n' +
    'Young,Cara,55555,2/1/2012\n' +
    'Smith,Ada,12345,10/2/2013\n'
  ).rows;
  const preview = H.previewSemesterCsv(csv, users);
  if (preview.totals.ready === 2 && preview.totals.willUpdate === 2) ok('exact matches are ready to update');
  else bad('exact matches are ready to update', JSON.stringify(preview.totals));
  const applied = preview.rows.filter((r) => r.eligible);
  const html = H.buildBatchPrintHtml(applied);
  const youngAt = html.indexOf('55555');
  const smithAt = html.indexOf('12345');
  const cards = html.split('loginSimpleCard').length - 1;
  if (cards === 2 && smithAt >= 0 && youngAt >= 0 && smithAt < youngAt) {
    ok('batch print contains all successful students in alphabetical order');
  } else {
    bad('batch print contains all successful students in alphabetical order', html.slice(0, 200));
  }
  if (html.includes('October022013') && html.includes('February012012') && html.includes('@trinidad.k12.co.us')) {
    ok('batch print cards include derived passwords and domain outside the box');
  } else {
    bad('batch print cards include derived passwords and domain outside the box');
  }
}

/* ---------- UI contracts ---------- */
if (adminHtml.includes('Bulk Semester Credentials') && adminHtml.includes('bulkSemesterCsv') && adminHtml.includes('lantern-semester-credentials.js')) {
  ok('Admin Students bulk importer present');
} else bad('Admin Students bulk importer present');
if (adminHtml.includes('TOTAL ROWS') && adminHtml.includes('WILL UPDATE') && adminHtml.includes('UPDATE N STUDENTS')) {
  ok('preview totals + typed confirmation copy present');
} else bad('preview totals + typed confirmation copy present');
if (!/dob|date_of_birth|birthday/i.test(workerSrc.slice(workerSrc.indexOf('bulk-set-student-passwords'), workerSrc.indexOf('bulk-set-student-passwords') + 1800))) {
  ok('bulk route source does not persist DOB');
} else bad('bulk route source does not persist DOB');
if (loginHtml.includes('maxlength="6"') && loginHtml.includes('studentUsername') && loginHtml.includes('@trinidad.k12.co.us')) {
  ok('student six-character UI limit + domain outside field');
} else bad('student six-character UI limit + domain outside field');
if (loginHtml.includes('Staff Sign In') && loginHtml.includes('id="username"') && !/id="username"[^>]*maxlength/.test(loginHtml)) {
  ok('staff login remains unrestricted');
} else bad('staff login remains unrestricted');
if (H.studentLoginLocalPart('12345@trinidad.k12.co.us') === '12345' && H.studentLoginLocalPart('1234567') === '123456') {
  ok('student login strips/submits Student ID only');
} else bad('student login strips/submits Student ID only');
if (loginHtml.includes('id="pwToggle"') && /Show/.test(loginHtml)) ok('password Show control present');
else bad('password Show control present');

{
  const harness = fs.readFileSync(path.join(root, 'worker/scripts/bulk-results-harness.html'), 'utf8');
  if (
    harness.includes('12345') &&
    harness.includes('October022013') &&
    harness.includes('23456') &&
    harness.includes('February012012') &&
    harness.includes('34567') &&
    harness.includes('November092011') &&
    harness.includes('Johnny') &&
    !/fetch\s*\(|bulk-set-student-passwords|credentials:\s*'include'/i.test(harness)
  ) {
    ok('local bulk-results harness uses fake rows and no Worker/D1 calls');
  } else {
    bad('local bulk-results harness uses fake rows and no Worker/D1 calls');
  }
}

if (
  adminHtml.includes('id="bulkSemesterPrintBtn"') &&
  adminHtml.includes('Print All') &&
  adminHtml.includes('id="bulkSemesterPdfBtn"') &&
  adminHtml.includes('Save Login Sheets PDF') &&
  adminHtml.includes('id="bulkSemesterLanSchoolBtn"') &&
  adminHtml.includes('Save LanSchool Setup Sheet') &&
  adminHtml.includes('id="bulkLanSchoolSetup"') &&
  adminHtml.includes('mountLanSchoolResults')
) {
  ok('bulk results expose Print All, PDF, and LanSchool setup actions');
} else {
  bad('bulk results expose Print All, PDF, and LanSchool setup actions');
}

{
  const sample = [
    { firstName: 'Ada', lastName: 'Smith', studentNumber: '12345', username: '12345', password: 'October022013', dobRaw: '10/2/2013' },
    { firstName: 'Cara', lastName: 'Young', studentNumber: '55555', username: '55555', password: 'February012012' },
  ];
  if (H.usernameCopyValue(sample[0]) === '12345' && H.usernameCopyValue({ studentNumber: '12345@trinidad.k12.co.us' }) === '12345') {
    ok('copy username is Student ID only');
  } else bad('copy username is Student ID only');
  if (H.passwordCopyValue(sample[0]) === 'October022013') ok('copy password is MonthDDYYYY only');
  else bad('copy password is MonthDDYYYY only');

  const exported = H.exportLanSchoolStudents(sample);
  const exportedText = JSON.stringify(exported);
  if (exported.length === 2 && exported[0].studentId === '12345' && !/dob|date_of_birth|10\/2\/2013|birthday/i.test(exportedText)) {
    ok('LanSchool export omits DOB and extra student fields');
  } else bad('LanSchool export omits DOB and extra student fields', exportedText);

  const offline = H.buildLanSchoolSetupFileHtml(sample);
  if (
    offline.includes('STEM LanSchool Setup') &&
    offline.includes('12345') &&
    offline.includes('October022013') &&
    offline.includes('Ada Smith') &&
    !/fetch\s*\(|XMLHttpRequest|lantern_pilot|credentials:\s*'include'|api\/admin/i.test(offline) &&
    !/https?:\/\//i.test(offline.replace('STEM LanSchool Setup', '')) &&
    !/dob|date_of_birth|10\/2\/2013|birthday/i.test(offline) &&
    !/<script src=/i.test(offline)
  ) {
    ok('offline LanSchool HTML is self-contained and has no network/session/DOB');
  } else {
    bad('offline LanSchool HTML is self-contained and has no network/session/DOB');
  }
  if (offline.includes('Mark Done') && offline.includes('lanschoolCopyBtn') && offline.includes('clipboard.writeText')) {
    ok('offline HTML has click-to-copy and Mark Done');
  } else bad('offline HTML has click-to-copy and Mark Done');

  const table = H.buildLanSchoolSetupTableHtml(sample);
  if (table.includes('data-copy-kind="username"') && table.includes('data-copy-value="12345"') && !table.includes('@trinidad.k12.co.us')) {
    ok('interactive table copies Student ID without domain');
  } else bad('interactive table copies Student ID without domain');
  if (table.includes('lanschoolSearch') && table.includes('data-filter="remaining"') && table.includes('0 of 2 Done')) {
    ok('results chrome has search, filters, and progress');
  } else bad('results chrome has search, filters, and progress');
  if (table.includes('aria-expanded="false"') && table.includes(' hidden') && table.includes('Remaining')) {
    ok('rows collapsed by default');
  } else bad('rows collapsed by default');

  const st = H.createLanSchoolResultsState(sample);
  if (!st.rows.some((r) => r.open) && H.currentLanSchoolStudentId(st) === '12345') ok('collapsed default + first remaining emphasized');
  else bad('collapsed default + first remaining emphasized');
  if (H.rowMatchesSearch(st.rows[0], 'Ada') && H.rowMatchesSearch(st.rows[0], 'Smith') && H.rowMatchesSearch(st.rows[0], 'Ada Smith') && H.rowMatchesSearch(st.rows[0], '12345') && !H.rowMatchesSearch(st.rows[0], 'Cara')) {
    ok('search matches first, last, full name, and Student ID');
  } else bad('search matches first, last, full name, and Student ID');
  st.query = 'cara';
  if (H.visibleLanSchoolRows(st).length === 1 && H.visibleLanSchoolRows(st)[0].studentId === '55555') ok('search filters visible rows');
  else bad('search filters visible rows');
  st.query = '';
  H.toggleLanSchoolRow(st, '12345');
  if (st.rows[0].open === true) ok('expand/collapse toggles row');
  else bad('expand/collapse toggles row');
  H.markLanSchoolRowDone(st, '12345');
  const vis = H.visibleLanSchoolRows(st);
  if (st.rows[0].done && st.rows[0].open === false && vis[vis.length - 1].studentId === '12345' && vis[0].studentId === '55555' && H.currentLanSchoolStudentId(st) === '55555') {
    ok('mark done collapses, sorts below remaining, and advances highlight');
  } else bad('mark done collapses, sorts below remaining, and advances highlight');
  if (H.lanSchoolProgress(st).label === '1 of 2 Done') ok('progress count after mark done');
  else bad('progress count after mark done', H.lanSchoolProgress(st).label);
  st.filter = 'done';
  if (H.visibleLanSchoolRows(st).length === 1 && H.visibleLanSchoolRows(st)[0].done) ok('Done filter shows completed only');
  else bad('Done filter shows completed only');
  st.filter = 'remaining';
  if (H.visibleLanSchoolRows(st).every((r) => !r.done) && H.visibleLanSchoolRows(st).length === 1) ok('Remaining filter hides done');
  else bad('Remaining filter hides done');

  if (
    offline.includes('lanschoolSearch') &&
    offline.includes('data-filter="all"') &&
    offline.includes('Mark Done') &&
    offline.includes('0 of 2 Done') &&
    offline.includes('aria-expanded') &&
    offline.includes('clipboard.writeText')
  ) {
    ok('offline HTML same search/collapse/filter/copy/progress behavior');
  } else bad('offline HTML same search/collapse/filter/copy/progress behavior');

  const pdf = H.buildLoginSheetsPdfBytes(sample);
  const pdfText = new TextDecoder().decode(pdf);
  if (pdf[0] === 0x25 && pdf[1] === 0x50 && pdf[2] === 0x44 && pdf[3] === 0x46 && pdfText.includes('October022013') && pdfText.includes('12345') && pdfText.includes('Log In') && pdfText.includes('User Name') && pdfText.includes('@trinidad.k12.co.us') && pdfText.includes('Month012013')) {
    ok('login-sheet PDF is a normal PDF with card text');
  } else bad('login-sheet PDF is a normal PDF with card text');
  if (!/javascript|clipboard|10\/2\/2013|date_of_birth|STEM Login Sheets/i.test(pdfText)) {
    ok('PDF has approved login layout and no JS/DOB');
  } else bad('PDF has approved login layout and no JS/DOB');
  const card = H.buildLoginCardHtml('12345', 'October022013');
  if (
    card.includes('loginSimpleCard') &&
    card.includes('loginSimpleIdBox') &&
    card.includes('loginSimpleDomain') &&
    card.indexOf('loginSimpleIdBox') < card.indexOf('loginSimpleDomain') &&
    card.includes('@trinidad.k12.co.us')
  ) {
    ok('print card matches approved login-sheet template');
  } else bad('print card matches approved login-sheet template');
}

if (!/bulk-set-student-passwords[\s\S]{0,80}pdf|lanschool|STEM-Login-Sheets|STEM-LanSchool-Setup/i.test(workerSrc)) {
  ok('no new Worker persistence route for PDF/HTML exports');
} else bad('no new Worker persistence route for PDF/HTML exports');

{
  let copiedValue = '';
  const fakeDoc = {
    body: {
      appendChild: function (el) { copiedValue = el.value; },
      removeChild: function () {},
    },
    createElement: function () {
      return {
        value: '',
        style: {},
        setAttribute: function () {},
        focus: function () {},
        select: function () {},
      };
    },
    execCommand: function (cmd) { return cmd === 'copy'; },
  };
  fakeDoc.body.ownerDocument = fakeDoc;
  const result = H.fallbackCopyValue('12345', fakeDoc);
  if (result.ok && result.method === 'execCommand' && copiedValue === '12345') {
    ok('fallback copy writes clicked Student ID only');
  } else {
    bad('fallback copy writes clicked Student ID only', JSON.stringify(result) + ' ' + copiedValue);
  }
}

/* ---------- Worker route ---------- */
async function runApi() {
  const admin = account();
  const student = account({
    username: '12345',
    role: 'student',
    first_name: 'Ada',
    last_name: 'Smith',
    mtss_student_id: '12345',
    must_change_password: 1,
  });
  const teacher = account({ username: 'ms_carter', role: 'teacher' });
  const inactive = account({ username: '22222', role: 'student', is_active: 0 });
  const state = {
    accounts: {
      admin,
      '12345': student,
      ms_carter: teacher,
      '22222': inactive,
    },
  };
  const env = makeEnv(state);
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);

  {
    const res = await worker.fetch(req('POST', '/api/admin/users/bulk-set-student-passwords', {
      students: [{ username: '12345', password: 'October022013' }],
    }, adminCookie), env);
    const body = await res.json();
    const text = JSON.stringify(body);
    if (res.status === 200 && body.ok && body.updated && body.updated[0] === '12345') ok('bulk route updates matched student');
    else bad('bulk route updates matched student', text);
    if (!Object.prototype.hasOwnProperty.call(body, 'password') && !/October022013/.test(text) && !/OLDSALT/.test(text)) {
      ok('bulk route does not return password');
    } else bad('bulk route does not return password', text);
    if (state.accounts['12345'].must_change_password === 0) ok('bulk route sets must_change_password = 0');
    else bad('bulk route sets must_change_password = 0', state.accounts['12345'].must_change_password);
    if (state.accounts['12345'].password_hash !== 'OLDHASH' && state.accounts['12345'].password_salt !== 'OLDSALT') {
      ok('bulk route writes new hash and salt');
    } else bad('bulk route writes new hash and salt');
    if (!/dob|date_of_birth|birthday/i.test(text)) ok('no DOB persistence in apply response');
    else bad('no DOB persistence in apply response', text);
  }

  {
    const res = await worker.fetch(req('POST', '/api/admin/users/bulk-set-student-passwords', {
      students: [{ username: 'ms_carter', password: 'October022013' }],
    }, adminCookie), env);
    const body = await res.json();
    if (body.ok && body.updated_count === 0 && body.skipped && body.skipped[0] && body.skipped[0].reason === 'inactive_or_not_student') {
      ok('bulk route rejects non-student');
    } else bad('bulk route rejects non-student', JSON.stringify(body));
  }

  {
    const res = await worker.fetch(req('POST', '/api/admin/users/bulk-set-student-passwords', {
      students: [{ username: '22222', password: 'February012012' }],
    }, adminCookie), env);
    const body = await res.json();
    if (body.skipped && body.skipped[0] && body.skipped[0].reason === 'inactive_or_not_student') ok('bulk route rejects inactive student');
    else bad('bulk route rejects inactive student', JSON.stringify(body));
  }

  {
    const res = await worker.fetch(req('POST', '/api/admin/users/bulk-set-student-passwords', {
      students: [{ username: '12345', password: 'October022013' }],
    }, teacherCookie), env);
    if (res.status === 403) ok('non-admin cannot call bulk route');
    else bad('non-admin cannot call bulk route', res.status);
  }
}

await runApi();

console.log('\nsemester-bulk-credentials-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
