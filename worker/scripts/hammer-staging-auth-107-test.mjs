/**
 * Hammer staging Geppetto SSO tier (#107).
 * Usage: node worker/scripts/hammer-staging-auth-107-test.mjs
 */
import {
  sanitizeGeppettoStudentReturn,
  isAllowedGeppettoCallbackHost,
  geppettoBridgeScopeFromSafeReturn,
  geppettoStudentAudienceForScope,
  mintGeppettoStudentHandoff,
  redeemGeppettoStudentHandoff,
  resolveGeppettoBridgeSecretAudience,
  GEPPETTO_STUDENT_AUDIENCE,
  GEPPETTO_STUDENT_PREVIEW_AUDIENCE,
  GEPPETTO_HAMMER_STAGING_AUDIENCE,
  GEPPETTO_STUDENT_CALLBACK_PATH,
  LANTERN_GEPPETTO_HAMMER_STAGING_AUTH_V107,
} from '../geppetto-student-handoff.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const PROD_CB = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const PREVIEW_CB = 'https://ee91415e.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const HAMMER_CB = 'https://geppetto-hammer-staging.pages.dev/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const TEST_PROD = 'test-geppetto-bridge-secret-not-real';
const TEST_PREVIEW = 'test-geppetto-preview-bridge-secret-not-real';
const TEST_HAMMER = 'test-geppetto-hammer-staging-bridge-secret-not-real';

function makeEnv() {
  return {
    LANTERN_GEPPETTO_BRIDGE_SECRET: TEST_PROD,
    LANTERN_GEPPETTO_PREVIEW_BRIDGE_SECRET: TEST_PREVIEW,
    LANTERN_GEPPETTO_HAMMER_STAGING_BRIDGE_SECRET: TEST_HAMMER,
  };
}

function makeDb(state) {
  state.handoffs = state.handoffs || {};
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) { binds.push(...args); return api; },
        async first() {
          if (s.includes('FROM geppetto_student_handoffs WHERE code_hash')) {
            return state.handoffs[String(binds[0] || '')] || null;
          }
          return null;
        },
        async run() {
          if (s.includes('INSERT INTO geppetto_student_handoffs')) {
            state.handoffs[String(binds[1])] = {
              code_hash: binds[1],
              lantern_username: binds[2],
              mtss_student_id: binds[3],
              display_name: binds[4],
              audience: binds[5],
              expires_at: binds[7],
              consumed_at: null,
            };
            return { success: true, meta: { changes: 1 } };
          }
          if (s.includes('UPDATE geppetto_student_handoffs') && s.includes('SET consumed_at')) {
            const row = state.handoffs[String(binds[1])];
            if (row && row.audience === binds[2] && !row.consumed_at && String(row.expires_at) > binds[3]) {
              row.consumed_at = binds[0];
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return api;
    },
  };
}

if (sanitizeGeppettoStudentReturn(PROD_CB).startsWith('https://mrradle.us' + GEPPETTO_STUDENT_CALLBACK_PATH)) {
  ok('production callback accepted only by prod tier scope');
} else bad('production callback');

if (sanitizeGeppettoStudentReturn(PREVIEW_CB).includes('ee91415e.geppetto-full-deploy-v6.pages.dev')) {
  ok('preview callback accepted only by preview tier scope');
} else bad('preview callback');

if (sanitizeGeppettoStudentReturn(HAMMER_CB).startsWith('https://geppetto-hammer-staging.pages.dev' + GEPPETTO_STUDENT_CALLBACK_PATH)) {
  ok('Hammer exact callback accepted');
} else bad('Hammer callback', sanitizeGeppettoStudentReturn(HAMMER_CB));

if (!sanitizeGeppettoStudentReturn('https://evil.pages.dev/api/stem-daily/student/lantern-callback') &&
    !isAllowedGeppettoCallbackHost('evil.pages.dev')) {
  ok('unknown pages.dev rejected');
} else bad('unknown pages.dev');

if (!sanitizeGeppettoStudentReturn('https://mrradle.us/api/stem-daily/student/wrong-path')) {
  ok('wrong path rejected');
} else bad('wrong path');

if (geppettoBridgeScopeFromSafeReturn(PROD_CB) === 'production' &&
    geppettoStudentAudienceForScope('production') === GEPPETTO_STUDENT_AUDIENCE) {
  ok('production scope -> production audience');
} else bad('production scope');

if (geppettoBridgeScopeFromSafeReturn(PREVIEW_CB) === 'preview' &&
    geppettoStudentAudienceForScope('preview') === GEPPETTO_STUDENT_PREVIEW_AUDIENCE) {
  ok('preview scope -> preview audience');
} else bad('preview scope');

if (geppettoBridgeScopeFromSafeReturn(HAMMER_CB) === 'hammer_staging' &&
    geppettoStudentAudienceForScope('hammer_staging') === GEPPETTO_HAMMER_STAGING_AUDIENCE) {
  ok('Hammer scope -> hammer audience');
} else bad('Hammer scope');

const env = makeEnv();
if (resolveGeppettoBridgeSecretAudience(env, TEST_PROD).audience === GEPPETTO_STUDENT_AUDIENCE &&
    resolveGeppettoBridgeSecretAudience(env, TEST_PREVIEW).audience === GEPPETTO_STUDENT_PREVIEW_AUDIENCE &&
    resolveGeppettoBridgeSecretAudience(env, TEST_HAMMER).audience === GEPPETTO_HAMMER_STAGING_AUDIENCE) {
  ok('secret tier maps to audience');
} else bad('secret tier map');

if (resolveGeppettoBridgeSecretAudience(env, 'wrong-secret').ok === false &&
    resolveGeppettoBridgeSecretAudience(env, TEST_PROD).audience !== GEPPETTO_HAMMER_STAGING_AUDIENCE &&
    resolveGeppettoBridgeSecretAudience(env, TEST_HAMMER).audience !== GEPPETTO_STUDENT_AUDIENCE) {
  ok('cross-tier secret rejection');
} else bad('cross-tier secret');

const state = {};
const db = makeDb(state);
const minted = await mintGeppettoStudentHandoff(db, {
  mtssStudentId: 'HAMMER_STAGING_ROBOT_V1',
  lanternUsername: 'hammer_staging_robot_v1',
  displayName: 'Hammer Student',
  audience: GEPPETTO_HAMMER_STAGING_AUDIENCE,
});
if (minted.ok && minted.ttl_seconds === 90) ok('one-time handoff TTL unchanged');
else bad('handoff TTL', minted);

const redeemed = await redeemGeppettoStudentHandoff(db, minted.code, GEPPETTO_HAMMER_STAGING_AUDIENCE);
const replay = await redeemGeppettoStudentHandoff(db, minted.code, GEPPETTO_HAMMER_STAGING_AUDIENCE);
if (redeemed.ok && redeemed.mtss_student_id === 'HAMMER_STAGING_ROBOT_V1' && !replay.ok) {
  ok('one-time handoff semantics unchanged');
} else bad('one-time handoff', { redeemed, replay });

if (LANTERN_GEPPETTO_HAMMER_STAGING_AUTH_V107 === 'LANTERN_GEPPETTO_HAMMER_STAGING_AUTH_V107') {
  ok('Lantern V107 marker present');
} else bad('Lantern V107 marker');

console.log('hammer-staging-auth-107-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
