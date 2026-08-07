/**
 * Locker personal feed relationship + identity tests.
 * Usage: node worker/scripts/locker-personal-feed-test.mjs
 */
import { handleLockerRoutes } from '../locker-handlers.js';
import { identityKeysForAccount, lockerPersonalFeedTest } from '../locker-personal-feed.js';

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

const account = {
  username: '20889',
  display_name: 'Lucas',
  student_character_name: '20889',
  role: 'student',
  _economy_character_name: '20889',
};

const keys = identityKeysForAccount(account, '20889');

if (keys.has('20889') && !keys.has('lucas')) ok('permanent identity keys exclude display_name');
else bad('permanent identity keys', [...keys]);

const submittedItem = { id: 'a', authorId: '20889', authorDisplayName: '20889', type: 'article' };
const otherItem = { id: 'b', authorId: '99999', authorDisplayName: '99999', type: 'article' };
const taggedItem = {
  id: 'c',
  authorId: '99999',
  extra_json: JSON.stringify({ photographer: '20889' }),
  type: 'photo',
};

if (lockerPersonalFeedTest.isSubmittedByIdentity(submittedItem, keys, '20889')) ok('submitted match by authorId');
else bad('submitted match');

if (!lockerPersonalFeedTest.isSubmittedByIdentity(otherItem, keys, '20889')) ok('submitted excludes other author');
else bad('submitted isolation');

if (lockerPersonalFeedTest.isTaggedForIdentity(taggedItem, keys)) ok('tagged match structured attribution');
else bad('tagged match');

if (!lockerPersonalFeedTest.isTaggedForIdentity({ id: 'd', authorId: '99999' }, keys)) ok('tagged excludes without attribution');
else bad('tagged exclusion');

const deps = {
  jsonResponse,
  getPilotAccountFromRequest: async () => account,
  pilotEconomyCharacterName: () => '20889',
  pilotAccountRequiresChangePassword: () => false,
};

async function testRejectIdentityParam() {
  const req = new Request('https://lantern.test/api/locker/personal-feed?username=99999');
  const url = new URL(req.url);
  const res = await handleLockerRoutes(req, url, '/api/locker/personal-feed', { DB: {} }, {}, deps);
  const body = await res.json();
  if (res.status === 400 && body.error === 'identity_params_not_allowed') ok('personal-feed rejects identity query param');
  else bad('personal-feed identity rejection', body);
}

await testRejectIdentityParam();

console.log('\n--- locker-personal-feed-test:', pass, 'passed,', fail, 'failed ---');
process.exit(fail ? 1 : 0);
