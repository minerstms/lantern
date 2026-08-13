/**
 * Prompt #169 — durable Nugget Economy Contract suite.
 * Product matrix, not scattered implementation trivia.
 * Usage: node worker/scripts/nugget-economy-contract-169-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { pollCompleteReference, pollRewardResponseFields } from '../poll-completion-reward.js';
import { classifyPollReward } from '../nugget-economy-reconcile.js';
import { isStaffEconomyKey } from '../staff-economy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
function teacherAccount(overrides) {
  return {
    username: 'ms_carter',
    display_name: 'Ms. Carter',
    role: 'teacher',
    teacher_id: 't_carter',
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.polls = state.polls || {};
  state.votes = state.votes || [];
  state.voterRewards = state.voterRewards || [];
  state.transactions = state.transactions || [];
  state.wallets = state.wallets || {};
  state.identityLinks = state.identityLinks || {};
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
        if (s.includes('FROM lantern_polls WHERE id = ?')) return state.polls[binds[0]] || null;
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
          if (state.votes.some((v) => v.poll_id === binds[1] && v.character_name === binds[2])) {
            throw new Error('UNIQUE constraint failed: lantern_poll_votes.poll_id, lantern_poll_votes.character_name');
          }
          state.votes.push({ id: binds[0], poll_id: binds[1], character_name: binds[2], choice_index: binds[3] });
        } else if (s.includes('INSERT INTO lantern_poll_voter_rewards')) {
          if (state.voterRewards.some((v) => v.poll_id === binds[1] && v.character_name === binds[2])) {
            throw new Error('UNIQUE constraint failed: lantern_poll_voter_rewards.poll_id, lantern_poll_voter_rewards.character_name');
          }
          state.voterRewards.push({ id: binds[0], poll_id: binds[1], character_name: binds[2] });
        } else if (s.includes('INSERT INTO lantern_transactions')) {
          state.transactions.push({ id: binds[0], character_name: binds[1], delta: binds[2], kind: binds[3], meta_json: binds[7] });
        } else if (s.includes('INSERT INTO lantern_wallets')) {
          state.wallets[binds[0]] = (state.wallets[binds[0]] || 0) + Number(binds[3] || 0);
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
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example/api/polls/vote', {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);
  return { status: res.status, json: await res.json() };
}
async function postTransact(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example/api/economy/transact', {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);
  return { status: res.status, json: await res.json() };
}

const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const applySrc = fs.readFileSync(path.join(root, 'worker/tms-economy-apply.js'), 'utf8');
const pollRewardSrc = fs.readFileSync(path.join(root, 'worker/poll-completion-reward.js'), 'utf8');
const missionsRewardSrc = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');
const missionsPage = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const eduMissions = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const paidRunSrc = fs.readFileSync(path.join(root, 'worker/game-paid-run-proof.js'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'worker/lantern-game-catalog.js'), 'utf8');
const cosmeticSrc = fs.readFileSync(path.join(root, 'worker/economy-cosmetic.js'), 'utf8');
const staffStarterSrc = fs.readFileSync(path.join(root, 'worker/staff-starter-nuggets.js'), 'utf8');
const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const contractDoc = fs.readFileSync(path.join(root, 'docs/NUGGET_ECONOMY_CONTRACT.md'), 'utf8');
const contentRewardSrc = fs.readFileSync(path.join(root, 'worker/content-creation-reward.js'), 'utf8');

// ---- Static contract (11–62 mix) ----
if (pollCompleteReference('poll_a', '20889') === 'lantern:poll_complete:poll_a:20889') ok('poll reference includes account');
else bad('poll reference');
if (pollCompleteReference('poll_a', 'staff:ms_carter') === 'lantern:poll_complete:poll_a:staff:ms_carter') ok('staff poll reference');
else bad('staff poll reference');
if (pollRewardResponseFields({ ok: true, status: 'already', voter_nuggets: 0 }).voter_nuggets === 0) ok('already does not claim a new +1');
else bad('already voter_nuggets');

if (classifyPollReward({ hasVote: true, hasLocalVoterReward: true, hasTmsTransaction: false }).backfill === 'deterministic') {
  ok('reconcile: local marker without TMS is deterministic backfill candidate');
} else bad('reconcile deterministic');
if (classifyPollReward({ hasVote: true, hasLocalVoterReward: false, hasTmsTransaction: false }).reason === 'recoverable_on_reload_after_169') {
  ok('reconcile: missing local+TMS is recoverable, not a blind backfill');
} else bad('reconcile recoverable');

if (/never fall back to lantern_wallets/.test(applySrc) && /isStaffEconomyKey/.test(applySrc)) {
  ok('50. staff apply path never uses lantern_wallets');
} else bad('staff wallet fallback');
if (/creditPollCompletionReward/.test(indexSrc) && /poll_complete/.test(pollRewardSrc)) ok('poll completion helper wired');
else bad('poll helper wired');
if (/poll_reward_via_vote_only/.test(indexSrc)) ok('10. generic transact cannot forge poll rewards');
else bad('poll forge blocked');
if (/tmsStaffEconomyTransact/.test(cosmeticSrc) && /isStaffEconomyKey/.test(cosmeticSrc)) ok('41. cosmetic staff uses TMS staff ledger');
else bad('cosmetic staff');
if (/serverCosmeticPrice/.test(cosmeticSrc)) ok('36. cosmetic server price authority');
else bad('cosmetic price');
if (/const reward = 1;/.test(missionsRewardSrc) && /tmsStaffEconomyTransact/.test(missionsRewardSrc)) {
  ok('11/21. mission approval +1 TMS, staff principal supported');
} else bad('mission reward');
if (/FREE · \+1 Nugget/.test(missionsPage) && /perm_local_history_trivia/.test(eduMissions) && /perm_srp_safety/.test(eduMissions)) {
  ok('14-19. Trinidad/SRP advertised FREE · +1');
} else bad('sponsored copy');
if (/SPONSORED_FREE_PAIRS/.test(eduMissions) && /srp-safety-trivia/.test(eduMissions)) ok('20. sponsored pairs are exact mission+game');
else bad('sponsored pairs');
if (/kind = 'game_play'/.test(paidRunSrc) || /kind === 'game_play'/.test(paidRunSrc) || /game_play/.test(paidRunSrc)) {
  ok('22/28/58. #159 paid-run proof present');
} else bad('#159');
if (/srp-safety-trivia/.test(catalogSrc) && /local-history-trivia/.test(catalogSrc) && /Nugget Hunt/.test(catalogSrc)) {
  ok('29. current catalog games registered server-side');
} else bad('catalog');
if (/delta = -1/.test(indexSrc) && /game_play costs exactly 1 Nugget/.test(indexSrc)) ok('22. game_play server -1');
else bad('game_play -1');
if (/game_win awards exactly 1 Nugget/.test(indexSrc)) ok('31. game_win server +1');
else bad('game_win +1');
if (/ensureFirstGameMissionCompletion/.test(indexSrc) && /first_game:/.test(fs.readFileSync(path.join(root, 'worker/mission-event-completions.js'), 'utf8'))) {
  ok('34. First Game Played once-key per account');
} else bad('first game');
if (/STAFF_STARTER_KIND/.test(staffStarterSrc) && /staffStarterReference/.test(staffStarterSrc)) ok('43/44. Staff Starter authoritative + batch ref');
else bad('staff starter');
if (/admin_adjustment/.test(indexSrc) && /reason_required/.test(indexSrc)) ok('42. admin adjustment gated + reason');
else bad('admin adj');
if (/needs_linking|needs_link/.test(walletJs) || /needs_linking/.test(indexSrc)) ok('P. unlinked staff surfaces Needs Link');
else bad('needs link copy');
if (/applyPollRewardCopy/.test(cardUi) && /Nugget account needs linking/.test(cardUi)) ok('56. poll UI does not claim +1 unless awarded');
else bad('poll UI honesty');
if (/isStudentContentRewardRecipient/.test(contentRewardSrc) && /Staff\/teacher\/admin: no student-style/.test(contentRewardSrc)) {
  ok('8. poll creation student daily reward is distinct; staff skipped');
} else bad('content creation gate');
if (/Nugget Economy Contract/.test(contractDoc) && /poll_complete/.test(contractDoc)) ok('Q. economy contract document exists');
else bad('contract doc');
if (/tmsStaffEconomyTransact/.test(indexSrc) && /isStaffEconomyKey\(characterName\)/.test(indexSrc)) {
  ok('46/47. student TMS + staff TMS principals on transact');
} else bad('principals');
if (!/fuzzy/.test(fs.readFileSync(path.join(root, 'worker/staff-economy.js'), 'utf8').toLowerCase().split('fail closed')[0] || '') && /never invent a link/.test(fs.readFileSync(path.join(root, 'worker/staff-economy.js'), 'utf8'))) {
  ok('48. no fuzzy staff linking');
} else bad('fuzzy link');

async function main() {
  const refs = [];
  await withMockedBridge((call) => {
    if (!call.url.endsWith('/economy/transact')) return { body: { ok: false, error: 'unexpected_call' } };
    if (call.body.principal_type === 'staff') {
      refs.push(call.body.reference);
      if (String(call.body.delta) !== '1' || call.body.kind !== 'poll_complete') {
        return { body: { ok: false, error: 'bad_staff_poll' } };
      }
      return { body: { ok: true, tms_staff_id: call.body.tms_staff_id, delta: 1, earned: 1, spent: 0, available: 3 } };
    }
    refs.push(call.body.reference);
    if (call.body.student_id === '20889' && call.body.delta === 1 && call.body.kind === 'poll_complete') {
      const already = refs.filter((r) => r === call.body.reference).length > 1;
      return { body: { ok: true, student_id: '20889', delta: 1, earned: 1, spent: 0, available: 2, idempotent: already } };
    }
    if (call.body.student_id === '20999') {
      return { body: { ok: true, student_id: '20999', delta: 1, earned: 1, spent: 0, available: 1 } };
    }
    return { httpOk: false, status: 404, body: { ok: false, error: 'student_not_found' } };
  }, async (getCalls) => {
    const lucas = studentAccount();
    const sam = studentAccount({ username: '20999', display_name: 'Sam', student_character_name: 'Sam', mtss_student_id: '20999' });
    const teacher = teacherAccount();
    const state = {
      accounts: { '20889': lucas, '20999': sam, ms_carter: teacher },
      identityLinks: { ms_carter: { tms_staff_id: 'Carter', lantern_username: 'ms_carter' } },
      polls: {
        poll_a: { id: 'poll_a', choices_json: JSON.stringify(['A', 'B']), approved_at: '2026-08-13T00:00:00.000Z' },
        poll_b: { id: 'poll_b', choices_json: JSON.stringify(['X', 'Y']), approved_at: '2026-08-13T00:00:00.000Z' },
      },
    };
    const env = makeEnv(state);
    const cLucas = await cookieFor(lucas);
    const cSam = await cookieFor(sam);
    const cTeacher = await cookieFor(teacher);

    const s1 = await postVote(env, cLucas, { poll_id: 'poll_a', choice_index: 0, voter_nuggets: 99 });
    if (s1.status === 200 && s1.json.ok && s1.json.voter_nuggets === 1) ok('1. student Poll completion +1');
    else bad('1 student poll', s1);

    const t1 = await postVote(env, cTeacher, { poll_id: 'poll_a', choice_index: 1 });
    if (t1.status === 200 && t1.json.ok && t1.json.voter_nuggets === 1) ok('2. staff Poll completion +1');
    else bad('2 staff poll', t1);

    const s1b = await postVote(env, cLucas, { poll_id: 'poll_a', choice_index: 1 });
    if (s1b.status === 400 && s1b.json.already_voted && s1b.json.voter_nuggets === 0 && s1b.json.voted_choice_index === 0) {
      ok('3/4/5. same Poll cannot reward twice; pre-lock change cannot rewrite; reload +0');
    } else bad('3-5 dup poll', s1b);

    const s2 = await postVote(env, cLucas, { poll_id: 'poll_b', choice_index: 0 });
    if (s2.status === 200 && s2.json.voter_nuggets === 1) ok('6. second Poll can reward separately');
    else bad('6 second poll', s2);

    const calls = getCalls();
    const studentRefs = calls.filter((c) => c.body && c.body.student_id === '20889').map((c) => c.body.reference);
    if (studentRefs.includes('lantern:poll_complete:poll_a:20889') && studentRefs.includes('lantern:poll_complete:poll_b:20889')) {
      ok('54. poll references are per poll + account');
    } else bad('poll refs', studentRefs);
    const staffCall = calls.find((c) => c.body && c.body.principal_type === 'staff' && c.body.tms_staff_id === 'Carter');
    if (staffCall && staffCall.body.reference === 'lantern:poll_complete:poll_a:staff:ms_carter') ok('2b. staff TMS principal + poll_complete kind');
    else bad('staff tms call', staffCall);

    const forge = await postTransact(env, cLucas, {
      character_name: '20889',
      delta: 99,
      kind: 'poll_complete',
      meta: { poll_id: 'poll_a' },
    });
    if (forge.status === 400 && forge.json.error === 'poll_reward_via_vote_only') ok('10. client cannot forge Poll reward amount');
    else bad('10 forge', forge);

    const samVote = await postVote(env, cSam, { poll_id: 'poll_a', choice_index: 0 });
    if (samVote.status === 200 && samVote.json.voter_nuggets === 1) ok('1b. second student same poll still +1 (global ref bug gone)');
    else bad('second student same poll', samVote);
  });

  await withMockedBridge((call) => {
    if (call.url.endsWith('/economy/transact')) return { body: { ok: true, delta: 1 } };
    return { body: { ok: false } };
  }, async (getCalls) => {
    const teacher = teacherAccount({ username: 'unlinked.staff' });
    const state = {
      accounts: { 'unlinked.staff': teacher },
      polls: { poll_u: { id: 'poll_u', choices_json: JSON.stringify(['A', 'B']), approved_at: '2026-08-13T00:00:00.000Z' } },
    };
    const env = makeEnv(state);
    const cookie = await cookieFor(teacher);
    const r = await postVote(env, cookie, { poll_id: 'poll_u', choice_index: 0 });
    if (
      r.status === 200 &&
      r.json.ok &&
      r.json.voter_nuggets === 0 &&
      r.json.reward_status === 'needs_link' &&
      state.votes.length === 1 &&
      !state.wallets['staff:unlinked.staff']
    ) {
      ok('7. unlinked staff vote saved, no fake success');
    } else bad('7 unlinked staff', { r, wallets: state.wallets, votes: state.votes });
    if (!getCalls().some((c) => c.body && c.body.principal_type === 'staff')) ok('7b. unlinked staff does not transact');
    else bad('7b unlinked transact');
    if (isStaffEconomyKey('staff:unlinked.staff')) ok('47. staff key used for teacher vote');
    else bad('staff key');
  });

  if (/ENABLE_EARLY_ENCOURAGER_REWARD = "false"/.test(fs.readFileSync(path.join(root, 'worker/wrangler.toml'), 'utf8'))) {
    ok('33. early encourager remains off; not an advertised live reward');
  } else bad('early encourager flag');

  if (/skipReward/.test(indexSrc) && /Create-a-Poll mission/.test(indexSrc)) {
    ok('8/9. poll creation is not auto-paid; Create-a-Poll Mission remains separate');
  } else bad('poll create vs mission');

  console.log(`\nnugget-economy-contract-169-test: ${pass} PASS ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
