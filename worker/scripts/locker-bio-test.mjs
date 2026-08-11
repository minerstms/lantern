/**
 * Locker bio storage, validation, and secure self-service PATCH tests.
 * Usage: node worker/scripts/locker-bio-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleLockerRoutes, buildLockerMeResponse } from '../locker-handlers.js';
import { sanitizeBioInput, normalizeBioFromDb, resolveProfileBio, BIO_MAX_LENGTH } from '../locker-bio.js';
import { updateAccountBio } from '../locker-storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}

function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

function jsonResponse(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

const migrationPath = path.join(root, 'worker/migrations/047_lantern_account_bio.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
if (migrationSql.includes('ALTER TABLE lantern_pilot_accounts') && migrationSql.includes('ADD COLUMN bio TEXT')) {
  ok('account bio migration adds lantern_pilot_accounts.bio');
} else bad('account bio migration', migrationSql);

if (!/ALTER TABLE\s+lantern_avatar_profiles/i.test(migrationSql)) ok('migration does not alter avatar profile table');
else bad('migration touches avatar profiles');

function makeDb(state) {
  state.avatarProfiles = state.avatarProfiles || {};
  state.pilotAccounts = state.pilotAccounts || {};
  state.wallets = state.wallets || {};
  state.transactions = state.transactions || {};
  state.cosmeticOwnership = state.cosmeticOwnership || {};
  state.achievements = state.achievements || {};

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
          if (s.includes('FROM lantern_wallets')) return state.wallets[binds[0]] || null;
          if (s.includes('FROM lantern_avatar_profiles')) return state.avatarProfiles[binds[0]] || null;
          if (s.includes('FROM lantern_pilot_accounts') && s.includes('bio')) {
            const user = binds[0];
            return state.pilotAccounts[user] ? { bio: state.pilotAccounts[user].bio ?? null } : null;
          }
          if (s.includes('lantern_avatar_submissions') && s.includes('pending')) return null;
          if (s.includes('FROM lantern_cosmetic_ownership')) return state.cosmeticOwnership[binds[0]] || null;
          if (s.includes("LOWER(TRIM(status)) = 'accepted'")) return { c: 0 };
          if (s.includes('SUM(CASE WHEN delta > 0')) return { earned: 0 };
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_transactions')) return { results: state.transactions[binds[0]] || [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: [] };
          if (s.includes('FROM lantern_mission_submissions')) return { results: [] };
          if (s.includes('FROM lantern_poll_contributions')) return { results: [] };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: [] };
          if (s.includes('FROM lantern_achievements')) return { results: state.achievements[binds[0]] || [] };
          if (s.includes('lantern_reactions')) return { results: [] };
          return { results: [] };
        },
        async run() {
          if (s.includes('UPDATE lantern_pilot_accounts') && s.includes('bio')) {
            const bio = binds[0];
            const updatedAt = binds[1];
            const user = binds[2];
            if (!state.pilotAccounts[user]) {
              state.pilotAccounts[user] = { username: user };
            }
            state.pilotAccounts[user].bio = bio;
            state.pilotAccounts[user].updated_at = updatedAt;
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_avatar_profiles') && s.includes('bio')) {
            bad('save must not insert avatar profile row for bio-only update');
            return { success: false };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

const studentA = {
  username: '20889',
  display_name: 'Lucas',
  student_character_name: '20889',
  role: 'student',
  _economy_character_name: '20889',
};

const studentB = {
  username: '99999',
  display_name: 'Other',
  student_character_name: '99999',
  role: 'student',
  _economy_character_name: '99999',
};

const teacherA = {
  username: 'teacher1',
  display_name: 'Teacher One',
  teacher_id: 'teacher1',
  role: 'teacher',
};

const depsFor = (account) => ({
  jsonResponse,
  getPilotAccountFromRequest: async () => account,
  pilotEconomyCharacterName: (a) =>
    String(a.role || '').toLowerCase() === 'student' ? a._economy_character_name || a.student_character_name : null,
  pilotAccountRequiresChangePassword: () => false,
});

// Validation
const trim = sanitizeBioInput('  hello world  ');
if (trim.ok && trim.bio === 'hello world') ok('trims whitespace');
else bad('trim', trim);

const long = 'x'.repeat(181);
const tooLong = sanitizeBioInput(long);
if (!tooLong.ok && tooLong.error === 'bio_too_long') ok('rejects 181 chars');
else bad('181 chars', tooLong);

const maxOk = sanitizeBioInput('x'.repeat(180));
if (maxOk.ok && maxOk.bio.length === 180) ok('accepts 180 chars');
else bad('180 chars', maxOk);

const ctrl = sanitizeBioInput('hello\x07world');
if (!ctrl.ok && ctrl.error === 'invalid_bio_characters') ok('rejects control chars');
else bad('control chars', ctrl);

const html = sanitizeBioInput('<b>Hi</b>');
if (html.ok && html.bio === '<b>Hi</b>') ok('stores HTML as plain text literal');
else bad('html literal', html);

const empty = sanitizeBioInput('   ');
if (empty.ok && empty.bio === null) ok('empty clears bio');
else bad('empty clear', empty);

if (normalizeBioFromDb('  hi ') === 'hi' && normalizeBioFromDb('') === null) ok('normalizeBioFromDb');
else bad('normalizeBioFromDb');

if (resolveProfileBio('Account bio', 'Legacy bio') === 'Account bio') ok('account bio takes precedence');
else bad('account precedence');

if (resolveProfileBio(null, 'Legacy bio') === 'Legacy bio') ok('legacy avatar bio fallback when account empty');
else bad('legacy fallback');

if (resolveProfileBio('New account bio', 'Legacy bio') === 'New account bio') ok('new account value beats legacy fallback');
else bad('new beats legacy');

if (BIO_MAX_LENGTH === 180) ok('max length constant');
else bad('max length constant', BIO_MAX_LENGTH);

async function testReadAccountBio() {
  const db = makeDb({
    pilotAccounts: { '20889': { username: '20889', bio: 'Account-level bio.' } },
    wallets: { '20889': { balance: 5 } },
  });
  const body = await buildLockerMeResponse(studentA, { DB: db }, 'https://lantern.test');
  if (body.profile && body.profile.bio === 'Account-level bio.') ok('student reads account bio');
  else bad('student read account bio', body.profile);
}

async function testReadLegacyFallback() {
  const db = makeDb({
    pilotAccounts: { '20889': { username: '20889', bio: null } },
    avatarProfiles: {
      '20889': { character_name: '20889', current_avatar_key: 'avatars/x.png', bio: 'I like science.' },
    },
    wallets: { '20889': { balance: 5 } },
  });
  const body = await buildLockerMeResponse(studentA, { DB: db }, 'https://lantern.test');
  if (body.profile && body.profile.bio === 'I like science.') ok('legacy avatar bio fallback read');
  else bad('legacy fallback read', body.profile);
}

async function testReadTeacherBio() {
  const db = makeDb({
    pilotAccounts: { teacher1: { username: 'teacher1', bio: 'Teacher bio here.' } },
    wallets: { teacher1: { balance: 0 } },
  });
  const body = await buildLockerMeResponse(teacherA, { DB: db }, 'https://lantern.test');
  if (body.profile && body.profile.bio === 'Teacher bio here.') ok('teacher reads own account bio');
  else bad('teacher read bio', body.profile);
}

async function testNullBio() {
  const db = makeDb({
    pilotAccounts: { '20889': { username: '20889', bio: null } },
    avatarProfiles: {},
    wallets: { '20889': { balance: 0 } },
  });
  const body = await buildLockerMeResponse(studentA, { DB: db }, 'https://lantern.test');
  if (body.profile && body.profile.bio === null) ok('null bio when no account or legacy value');
  else bad('null bio', body.profile);
}

async function testPatchOwnBioWithoutAvatarRow() {
  const state = {
    pilotAccounts: { '20889': { username: '20889', bio: null } },
    avatarProfiles: {},
    wallets: { '20889': { balance: 0 } },
  };
  const db = makeDb(state);
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: '  My real bio.  ' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: db }, {}, depsFor(studentA));
  const body = await res.json();
  if (res.status === 200 && body.ok && body.profile.bio === 'My real bio.') ok('student saves bio without avatar profile row');
  else bad('student patch bio without avatar row', body);
  if (state.pilotAccounts['20889'] && state.pilotAccounts['20889'].bio === 'My real bio.') {
    ok('bio persisted on pilot account row');
  } else bad('bio persisted on account', state.pilotAccounts);
  if (!state.avatarProfiles['20889']) ok('save did not create avatar profile row');
  else bad('avatar row created', state.avatarProfiles);
}

async function testPatchTeacherBio() {
  const state = {
    pilotAccounts: { teacher1: { username: 'teacher1', bio: null } },
    avatarProfiles: {},
    wallets: { teacher1: { balance: 0 } },
  };
  const db = makeDb(state);
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'Classroom leader.' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: db }, {}, depsFor(teacherA));
  const body = await res.json();
  if (res.status === 200 && body.ok && body.profile.bio === 'Classroom leader.') ok('teacher updates own account bio');
  else bad('teacher patch bio', body);
}

async function testUnauthenticated() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => null,
    pilotEconomyCharacterName: () => null,
    pilotAccountRequiresChangePassword: () => false,
  };
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'nope' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: makeDb({}) }, {}, deps);
  const body = await res.json();
  if (res.status === 401 && body.error === 'not_authenticated') ok('unauthenticated rejected');
  else bad('unauthenticated', body);
}

async function testMustChangePassword() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => studentA,
    pilotEconomyCharacterName: () => '20889',
    pilotAccountRequiresChangePassword: () => true,
  };
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'nope' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: makeDb({ wallets: { '20889': { balance: 0 } }, pilotAccounts: { '20889': { username: '20889' } } }) }, {}, deps);
  const body = await res.json();
  if (res.status === 403 && body.error === 'must_change_password') ok('must_change_password rejected');
  else bad('must_change_password', body);
}

async function testRejectBodyIdentity() {
  const db = makeDb({ wallets: { '20889': { balance: 0 } }, pilotAccounts: { '20889': { username: '20889' } } });
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'hack', username: '99999' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: db }, {}, depsFor(studentA));
  const body = await res.json();
  if (res.status === 400 && body.error === 'identity_params_not_allowed') ok('client username rejected in body');
  else bad('body username rejected', body);
}

async function testRejectQueryIdentity() {
  const db = makeDb({ wallets: { '20889': { balance: 0 } }, pilotAccounts: { '20889': { username: '20889' } } });
  const req = new Request('https://lantern.test/api/locker/me/bio?character_name=99999', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'hack' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: db }, {}, depsFor(studentA));
  const body = await res.json();
  if (res.status === 400 && body.error === 'identity_params_not_allowed') ok('query character_name rejected');
  else bad('query identity rejected', body);
}

async function testSessionIsolation() {
  const state = {
    pilotAccounts: {
      '20889': { username: '20889', bio: null },
      '99999': { username: '99999', bio: 'Other bio' },
    },
    avatarProfiles: {},
    wallets: { '20889': { balance: 0 }, '99999': { balance: 0 } },
  };
  const db = makeDb(state);
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: 'Student A bio' }),
  });
  await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: db }, {}, depsFor(studentA));
  if (state.pilotAccounts['20889'] && state.pilotAccounts['20889'].bio === 'Student A bio') ok('session writes own account row only');
  else bad('session isolation write', state.pilotAccounts);
  if (state.pilotAccounts['99999'].bio === 'Other bio') ok('other account bio untouched');
  else bad('other account untouched', state.pilotAccounts);
}

async function testClearBio() {
  const state = {
    pilotAccounts: { '20889': { username: '20889', bio: 'Old bio' } },
    avatarProfiles: {},
    wallets: { '20889': { balance: 0 } },
  };
  const db = makeDb(state);
  const req = new Request('https://lantern.test/api/locker/me/bio', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bio: '   ' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/me/bio', { DB: db }, {}, depsFor(studentA));
  const body = await res.json();
  if (body.ok && body.profile.bio === null) ok('empty value clears bio');
  else bad('clear bio response', body);
}

async function testUpdateAccountBioDirect() {
  const state = { pilotAccounts: { '20889': { username: '20889' } } };
  const db = makeDb(state);
  const result = await updateAccountBio(db, '20889', 'Direct write');
  if (result.ok && result.bio === 'Direct write') ok('updateAccountBio storage helper');
  else bad('updateAccountBio', result);
}

const handlersJs = fs.readFileSync(path.join(root, 'worker/locker-handlers.js'), 'utf8');
if (handlersJs.includes('updateAccountBio(db, session.account.username')) ok('PATCH uses server-derived account username');
else bad('PATCH identity source');

if (handlersJs.includes('resolveProfileBio')) ok('read path resolves account + legacy bio');
else bad('resolveProfileBio in handlers');

// UI static checks
const shellJs = fs.readFileSync(path.join(root, 'app/js/lantern-locker-shell.js'), 'utf8');
const exploreHtml = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
if (shellJs.includes('Add a short bio.') && shellJs.includes('openAboutBioEditor') && shellJs.includes('textContent')) {
  ok('UI empty/add bio + textContent display (via Locker Options → Edit About)');
} else bad('UI shell bio');
if (shellJs.includes('callUpdateBio') && shellJs.includes('getFeedController')) ok('bio save avoids feed rerender path');
else bad('UI no feed rerender');
if (!exploreHtml.includes('lockerHeaderBio')) ok('Explore does not display personal bio');
else bad('Explore bio leak');

await testReadAccountBio();
await testReadLegacyFallback();
await testReadTeacherBio();
await testNullBio();
await testPatchOwnBioWithoutAvatarRow();
await testPatchTeacherBio();
await testUnauthenticated();
await testMustChangePassword();
await testRejectBodyIdentity();
await testRejectQueryIdentity();
await testSessionIsolation();
await testClearBio();
await testUpdateAccountBioDirect();

console.log('\n--- locker-bio-test:', pass, 'passed,', fail, 'failed ---');
process.exit(fail ? 1 : 0);
