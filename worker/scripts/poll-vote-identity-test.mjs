/**
 * Poll vote identity + Nugget reward tests — Prompt #96 (One Nugget Economy).
 *
 * POST /api/polls/vote used to trust `body.character_name` directly for BOTH who cast the vote
 * and who received the +1 Nugget participation reward, with no session check at all -- any caller
 * could vote/earn as an arbitrary character by editing the request payload. It also wrote the
 * reward straight into Lantern's own lantern_transactions/lantern_wallets tables, a second Nugget
 * economy independent of the authoritative TMS Nuggets ledger.
 *
 * This exercises the REAL worker/index.js fetch(request, env) entry point (not a stub) to prove:
 *  - No session -> 401 not_authenticated (vote never recorded, no reward).
 *  - A student session always votes/earns as their OWN session-derived character_name; a
 *    different character_name in the request body is ignored (mirrors the game_play identity
 *    fix), so a student cannot vote/earn Nuggets as another student.
 *  - The +1 participation reward is granted through the TMS Nuggets bridge (mocked), with a
 *    per-account reference `lantern:poll_complete:<poll_id>:<account_key>`, not a second local ledger.
 *  - Linked staff votes credit the TMS staff principal. Unlinked staff save the vote but return
 *    needs_link / voter_nuggets: 0 (never a fake lantern_wallets success).
 *  - A student_id the TMS bridge does not recognize (demo/persona character) falls back to the
 *    legacy local wallet instead of silently dropping the reward.
 *
 * Usage: node worker/scripts/poll-vote-identity-test.mjs
 */
import worker from '../index.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

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
    scn: account.student_character_name || null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function studentAccount(overrides) {
  return {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    teacher_id: null,
    mtss_student_id: '20889',
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.polls = state.polls || {};
  state.votes = state.votes || []; // { id, poll_id, character_name, choice_index }
  state.voterRewards = state.voterRewards || []; // { id, poll_id, character_name }
  state.transactions = state.transactions || [];
  state.wallets = state.wallets || {};
  state.identityLinks = state.identityLinks || {}; // lantern_username lower → { tms_staff_id }
  state.settings = state.settings || {};

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
        if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.identityLinks[key] || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lantern_staff_id')) {
          const sid = Number(binds[0]);
          return Object.values(state.identityLinks).find((l) => Number(l.lantern_staff_id) === sid) || null;
        }
        if (s.includes('FROM lantern_polls WHERE id = ?')) {
          return state.polls[binds[0]] || null;
        }
        if (s.includes('FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ?')) {
          return state.votes.find((v) => v.poll_id === binds[0] && v.character_name === binds[1]) || null;
        }
        if (s.includes('FROM lantern_poll_voter_rewards WHERE poll_id = ? AND character_name = ?')) {
          return state.voterRewards.find((v) => v.poll_id === binds[0] && v.character_name === binds[1]) || null;
        }
        if (s.includes('FROM lantern_wallets WHERE character_name = ?')) {
          const bal = state.wallets[binds[0]];
          return bal != null ? { balance: bal } : null;
        }
        if (s.includes('FROM lantern_settings WHERE key')) {
          const key = String(binds[0] || '');
          return state.settings[key] != null ? { value: String(state.settings[key]) } : null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_poll_votes WHERE poll_id = ?')) {
          return { results: state.votes.filter((v) => v.poll_id === binds[0]) };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_poll_votes')) {
          state.votes.push({ id: binds[0], poll_id: binds[1], character_name: binds[2], choice_index: binds[3] });
        } else if (s.includes('INSERT INTO lantern_poll_voter_rewards')) {
          state.voterRewards.push({ id: binds[0], poll_id: binds[1], character_name: binds[2] });
        } else if (s.includes('INSERT INTO lantern_transactions')) {
          state.transactions.push({ id: binds[0], character_name: binds[1], delta: binds[2], kind: binds[3], meta_json: binds[7] });
        } else if (s.includes('INSERT INTO lantern_wallets')) {
          state.wallets[binds[0]] = (state.wallets[binds[0]] || 0) + Number(binds[3] || 0);
        } else if (s.includes('INSERT INTO lantern_settings')) {
          state.settings[binds[0]] = binds[1];
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
  };
}

/** Installs a fake global.fetch standing in for TMS Nuggets' /api/lantern-bridge/economy/* endpoints. */
function withMockedBridge(behavior, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const call = { url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null };
    calls.push(call);
    const result = behavior(call);
    return {
      ok: result.httpOk !== false,
      status: result.status || (result.httpOk === false ? 400 : 200),
      json: async () => result.body,
    };
  };
  return fn(() => calls).finally(() => { globalThis.fetch = original; });
}

async function postVote(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const req = new Request('https://lantern.example/api/polls/vote', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  const json = await res.json();
  return { status: res.status, json };
}

async function main() {
  // 1. No session -> 401, nothing recorded.
  {
    const state = {
      polls: { poll_1: { id: 'poll_1', choices_json: JSON.stringify(['A', 'B']) } },
    };
    const env = makeEnv(state);
    const { status, json } = await postVote(env, null, { poll_id: 'poll_1', character_name: 'Lucas', choice_index: 0 });
    if (status === 401 && json && json.error === 'not_authenticated' && state.votes.length === 0) {
      ok('unauthenticated poll vote rejected (401), no vote/reward recorded');
    } else bad('unauthenticated poll vote should be rejected', { status, json, votes: state.votes });
  }

  // 2. Student session votes/earns as session identity, ignoring a different client character_name.
  await withMockedBridge((call) => {
    if (call.url.endsWith('/economy/transact')) {
      if (call.body.student_id !== '20889') return { body: { ok: false, error: 'unexpected_student' } };
      return { body: { ok: true, student_id: '20889', student_name: '20889', delta: 1, earned: 1, spent: 0, available: 1 } };
    }
    return { body: { ok: false, error: 'unexpected_call' } };
  }, async (getCalls) => {
    const state = {
      accounts: { '20889': studentAccount() },
      polls: { poll_2: { id: 'poll_2', choices_json: JSON.stringify(['A', 'B']) } },
      settings: { 'economy.poll_response': '1' },
    };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postVote(env, cookie, { poll_id: 'poll_2', character_name: 'someone_else', choice_index: 1 });
    const vote = state.votes.find((v) => v.poll_id === 'poll_2');
    if (status === 200 && json.ok && vote && vote.character_name === '20889') {
      ok('student session vote/reward uses session-derived character_name, not client-supplied name');
    } else bad('poll vote should force session identity', { status, json, vote });

    const calls = getCalls();
    const transactCall = calls.find((c) => c.url.endsWith('/economy/transact'));
    if (
      transactCall &&
      transactCall.body.student_id === '20889' &&
      transactCall.body.delta === 1 &&
      transactCall.body.kind === 'poll_complete' &&
      transactCall.body.reference === 'lantern:poll_complete:poll_2:20889'
    ) {
      ok('poll vote reward granted through TMS bridge with lantern:poll_complete:<poll_id>:<account> reference');
    } else bad('TMS bridge economy/transact call shape', transactCall);

    if (json.voter_nuggets === 1) ok('poll vote response reports voter_nuggets: 1 on TMS-backed grant');
    else bad('voter_nuggets should be 1', json);
  });

  // 3. TMS bridge does not recognize this student_id (demo/persona) -> falls back to legacy wallet.
  await withMockedBridge((call) => {
    if (call.url.endsWith('/economy/transact')) {
      return { httpOk: false, status: 404, body: { ok: false, error: 'student_not_found' } };
    }
    return { body: { ok: false, error: 'unexpected_call' } };
  }, async () => {
    const demoAccount = studentAccount({
      username: 'sam_star',
      mtss_student_id: null,
      student_character_name: 'Sam Star',
    });
    const state = {
      accounts: { sam_star: demoAccount },
      polls: { poll_3: { id: 'poll_3', choices_json: JSON.stringify(['A', 'B']) } },
      settings: { 'economy.poll_response': '1' },
    };
    const env = makeEnv(state);
    const cookie = await cookieFor(demoAccount);
    const { status, json } = await postVote(env, cookie, { poll_id: 'poll_3', choice_index: 0 });
    const walletBal = state.wallets['Sam Star'];
    if (status === 200 && json.ok && json.voter_nuggets === 1 && walletBal === 1) {
      ok('TMS-unrecognized (demo persona) student falls back to legacy local wallet for the reward');
    } else bad('demo persona fallback wallet credit', { status, json, walletBal });
  });

  // 4. Unlinked teacher: vote saves, no fake wallet success, needs_link.
  await withMockedBridge((call) => {
    if (call.url.endsWith('/economy/transact')) {
      return { body: { ok: true, student_id: call.body.student_id, student_name: call.body.student_id, delta: 1, earned: 1, spent: 0, available: 1 } };
    }
    return { body: { ok: false, error: 'unexpected_call' } };
  }, async (getCalls) => {
    const teacherAccount = {
      username: 'ms_carter',
      display_name: 'Ms. Carter',
      role: 'teacher',
      teacher_id: 't_carter',
      is_active: 1,
      must_change_password: 0,
    };
    const state = {
      accounts: { ms_carter: teacherAccount },
      polls: { poll_4: { id: 'poll_4', choices_json: JSON.stringify(['A', 'B']) } },
      settings: { 'economy.poll_response': '1' },
    };
    const env = makeEnv(state);
    const cookie = await cookieFor(teacherAccount);
    const { status, json } = await postVote(env, cookie, { poll_id: 'poll_4', character_name: '30001', choice_index: 0 });
    const vote = state.votes.find((v) => v.poll_id === 'poll_4');
    if (status === 200 && json.ok && vote && vote.character_name === 'staff:ms_carter') {
      ok('teacher session vote uses staff economy key; ignores client character_name');
    } else bad('teacher explicit character_name vote', { status, json, vote });
    if (json.voter_nuggets === 0 && json.reward_status === 'needs_link' && !state.wallets['staff:ms_carter']) {
      ok('unlinked teacher poll vote does not fake a Nugget success');
    } else bad('unlinked teacher must needs_link with no wallet credit', { json, wallets: state.wallets });
    const calls = getCalls();
    if (!calls.some((c) => c.body && c.body.principal_type === 'staff')) {
      ok('unlinked teacher never calls TMS staff transact');
    } else bad('unlinked teacher should not hit staff transact', calls);
  });

  // 5. Linked teacher: TMS staff principal +1, per-account reference, no student_id.
  await withMockedBridge((call) => {
    if (call.url.endsWith('/economy/transact') && call.body && call.body.principal_type === 'staff') {
      if (call.body.tms_staff_id !== 'Carter') return { body: { ok: false, error: 'unexpected_staff' } };
      return { body: { ok: true, tms_staff_id: 'Carter', delta: 1, earned: 1, spent: 0, available: 4 } };
    }
    if (call.url.endsWith('/economy/transact')) {
      return { body: { ok: false, error: 'student_path_not_allowed_for_staff' } };
    }
    return { body: { ok: false, error: 'unexpected_call' } };
  }, async (getCalls) => {
    const teacherAccount = {
      username: 'ms_carter',
      display_name: 'Ms. Carter',
      role: 'teacher',
      teacher_id: 't_carter',
      is_active: 1,
      must_change_password: 0,
    };
    const state = {
      accounts: { ms_carter: teacherAccount },
      identityLinks: { ms_carter: { tms_staff_id: 'Carter', lantern_username: 'ms_carter' } },
      polls: { poll_5: { id: 'poll_5', choices_json: JSON.stringify(['A', 'B']) } },
      settings: { 'economy.poll_response': '1' },
    };
    const env = makeEnv(state);
    const cookie = await cookieFor(teacherAccount);
    const { status, json } = await postVote(env, cookie, { poll_id: 'poll_5', choice_index: 1 });
    const vote = state.votes.find((v) => v.poll_id === 'poll_5');
    const calls = getCalls();
    const staffCall = calls.find((c) => c.body && c.body.principal_type === 'staff');
    if (
      status === 200 &&
      json.ok &&
      json.voter_nuggets === 1 &&
      vote &&
      vote.character_name === 'staff:ms_carter' &&
      staffCall &&
      staffCall.body.delta === 1 &&
      staffCall.body.kind === 'poll_complete' &&
      staffCall.body.reference === 'lantern:poll_complete:poll_5:staff:ms_carter' &&
      !state.wallets['staff:ms_carter']
    ) {
      ok('linked teacher poll completion credits TMS staff ledger once with per-account reference');
    } else bad('linked teacher poll TMS staff credit', { status, json, vote, staffCall, wallets: state.wallets });

    const replay = await postVote(env, cookie, { poll_id: 'poll_5', choice_index: 0 });
    if (
      replay.status === 400 &&
      replay.json.already_voted &&
      replay.json.voted_choice_index === 1 &&
      replay.json.voter_nuggets === 0
    ) {
      ok('linked teacher reload/change-after-lock does not award a second Nugget');
    } else bad('linked teacher duplicate poll reward', replay);
  });

  // 6. Prompt #229 — default/missing poll_response is 0: vote saves, no TMS credit.
  await withMockedBridge(() => ({ body: { ok: true, delta: 1 } }), async (getCalls) => {
    const state = {
      accounts: { '20889': studentAccount() },
      polls: { poll_zero: { id: 'poll_zero', choices_json: JSON.stringify(['A', 'B']) } },
    };
    const env = makeEnv(state);
    const cookie = await cookieFor(studentAccount());
    const { status, json } = await postVote(env, cookie, { poll_id: 'poll_zero', choice_index: 0 });
    const vote = state.votes.find((v) => v.poll_id === 'poll_zero');
    const marker = state.voterRewards.find((v) => v.poll_id === 'poll_zero');
    if (
      status === 200 &&
      json.ok &&
      json.voter_nuggets === 0 &&
      (json.reward_status === 'skipped' || json.reward_status === 'already') &&
      vote &&
      marker &&
      getCalls().length === 0
    ) {
      ok('default poll_response 0 saves the vote and skips TMS (no zero-value ledger credit)');
    } else bad('default poll reward 0', { status, json, vote, marker, tms: getCalls() });
  });

  console.log(`\npoll-vote-identity-test: ${pass} PASS ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
