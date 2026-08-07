/**
 * Admin First Name (display_name) — validation and identity safety tests.
 * Usage: node worker/scripts/admin-first-name-test.mjs
 */
import { DISPLAY_NAME_MAX_LEN, fetchAdminUserRow, validateDisplayName } from '../admin-account-utils.js';
import { buildLockerMeResponse } from '../locker-handlers.js';

let fail = 0;
let pass = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}

function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

function testValidateDisplayNameRequired() {
  const r = validateDisplayName('', { required: true });
  if (r.ok || r.error !== 'display_name_required') return bad('empty first name rejected', r);
  ok('new account requires first name');
}

function testValidateDisplayNamePersists() {
  const r = validateDisplayName('  Lucas  ', { required: true });
  if (!r.ok || r.value !== 'Lucas') return bad('trimmed first name', r);
  ok('first name persists as trimmed display_name');
}

function testValidateDisplayNameNormalNames() {
  for (const name of ["Mary-Jane", "O'Brien", 'José']) {
    const r = validateDisplayName(name, { required: true });
    if (!r.ok || r.value !== name) return bad('normal name accepted: ' + name, r);
  }
  ok('normal first names accepted');
}

function testValidateDisplayNameControlChars() {
  const r = validateDisplayName('Luc\x01as', { required: true });
  if (r.ok || r.error !== 'display_name_invalid_chars') return bad('control chars rejected', r);
  ok('control characters rejected');
}

function testValidateDisplayNameMaxLength() {
  const long = 'A'.repeat(DISPLAY_NAME_MAX_LEN + 1);
  const r = validateDisplayName(long, { required: true });
  if (r.ok || r.error !== 'display_name_too_long') return bad('max length enforced', r);
  ok('maximum length enforced');
}

function makeAccountsDb(initial) {
  const accounts = { ...(initial || {}) };
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_pilot_accounts') && s.includes('lower(trim(username))')) {
            const key = String(binds[0] || '').toLowerCase();
            for (const row of Object.values(accounts)) {
              if (String(row.username || '').toLowerCase() === key) return { ...row };
            }
            return null;
          }
          return null;
        },
        async run() {
          if (s.includes('UPDATE lantern_pilot_accounts SET display_name')) {
            const [display_name, username] = binds;
            const key = String(username || '').toLowerCase();
            for (const id of Object.keys(accounts)) {
              if (String(accounts[id].username || '').toLowerCase() === key) {
                accounts[id] = { ...accounts[id], display_name };
                return { success: true };
              }
            }
          }
          return { success: true };
        },
      };
      return api;
    },
    accounts,
  };
}

async function simulateDisplayNameOnlyUpdate(db, username, displayName) {
  const check = validateDisplayName(displayName, { required: true });
  if (!check.ok) return check;
  const existing = await fetchAdminUserRow(db, username);
  if (!existing) return { ok: false, error: 'not_found' };
  await db
    .prepare(`UPDATE lantern_pilot_accounts SET display_name = ?, updated_at = datetime('now') WHERE username = ?`)
    .bind(check.value, existing.username)
    .run();
  const updated = await fetchAdminUserRow(db, username);
  return { ok: true, user: updated };
}

async function testBlankDisplayNameCanBeUpdated() {
  const db = makeAccountsDb({
    a: {
      username: '20889',
      display_name: '',
      role: 'student',
      student_character_name: '20889',
      mtss_student_id: '20889',
      teacher_id: null,
      is_active: 1,
      must_change_password: 0,
    },
  });
  const res = await simulateDisplayNameOnlyUpdate(db, '20889', 'Lucas');
  if (!res.ok || !res.user || res.user.display_name !== 'Lucas') return bad('blank display name updated', res);
  ok('existing blank display name can be updated');
}

async function testIdentityKeysUnchangedOnFirstNameEdit() {
  const db = makeAccountsDb({
    a: {
      username: '20889',
      display_name: '',
      role: 'student',
      student_character_name: '20889',
      mtss_student_id: '20889',
      teacher_id: null,
      is_active: 1,
      must_change_password: 0,
    },
  });
  const res = await simulateDisplayNameOnlyUpdate(db, '20889', 'Lucas');
  const u = res.user;
  if (!u) return bad('user returned after update', res);
  if (u.username !== '20889') return bad('username unchanged', u.username);
  if (u.student_character_name !== '20889') return bad('student_character_name unchanged', u.student_character_name);
  if (u.mtss_student_id !== '20889') return bad('mtss_student_id unchanged', u.mtss_student_id);
  if (u.teacher_id !== null) return bad('teacher_id unchanged', u.teacher_id);
  ok('identity keys unchanged when first name edited');
}

async function testLockerMeUsesDisplayNameAndEconomyKey() {
  const account = {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: '20889',
    teacher_id: null,
    mtss_student_id: '20889',
    is_active: 1,
    must_change_password: 0,
    _economy_character_name: '20889',
  };
  const emptyDb = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
    },
  };
  const body = await buildLockerMeResponse(account, { DB: emptyDb }, 'https://example.test');
  if (!body.ok) return bad('locker me ok', body);
  if (body.account.display_name !== 'Lucas') return bad('locker display name', body.account);
  if (body.identity.economy_key !== '20889') return bad('locker economy key', body.identity);
  if (body.identity.economy_character_name !== '20889') return bad('locker economy character name', body.identity);
  ok('/api/locker/me shows first name with unchanged economy key');
}

function testNoFakeDefaultPersona() {
  const r = validateDisplayName('Alex Adventure', { required: true });
  if (!r.ok) return bad('explicit name ok', r);
  const blank = validateDisplayName('', { required: true });
  if (blank.ok) return bad('no fake default on empty', blank);
  ok('no fake default persona in validation');
}

testValidateDisplayNameRequired();
testValidateDisplayNamePersists();
testValidateDisplayNameNormalNames();
testValidateDisplayNameControlChars();
testValidateDisplayNameMaxLength();
await testBlankDisplayNameCanBeUpdated();
await testIdentityKeysUnchangedOnFirstNameEdit();
await testLockerMeUsesDisplayNameAndEconomyKey();
testNoFakeDefaultPersona();

console.log('\nadmin-first-name-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
