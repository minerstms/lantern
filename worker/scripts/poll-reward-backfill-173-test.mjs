/**
 * Prompt #173 — historical Poll reward backfill contract.
 * Usage: node worker/scripts/poll-reward-backfill-173-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAuthoritativeNuggetDelta } from '../tms-economy-apply.js';
import { pollCompleteReference } from '../poll-completion-reward.js';
import { classifyPollReward } from '../nugget-economy-reconcile.js';
import {
  BACKFILL_NOTE,
  BACKFILL_SOURCE,
  EXPECTED_DELTA_EACH,
  EXPECTED_STAFF_CANDIDATES,
  EXPECTED_STUDENT_CANDIDATES,
  EXPECTED_TOTAL_CANDIDATES,
  EXPECTED_TOTAL_DELTA,
  POLL_COMPLETE_KIND,
  applySpecForCandidate,
  canonicalPollCompleteReference,
  creditHistoricalPollReward,
  evaluateApplyGate,
  classifyVoteKey,
  expectedBalanceDeltaByPrincipal,
  findAuthoritativePollReward,
  legacyGlobalPollVoteReference,
  reconstructHistoricalPollRewardCandidates,
  resolveExactStaffIdentity,
  resolveExactStudentIdentity,
} from '../poll-reward-backfill-173.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const moduleSrc = read('worker/poll-reward-backfill-173.js');
const scriptSrc = read('worker/scripts/backfill-poll-rewards-173.mjs');
const applySrc = read('worker/tms-economy-apply.js');

function baseSnapshot(overrides) {
  const staffVotes = [];
  const staffRewards = [];
  const staffAccounts = [];
  const links = [];
  const tmsStaff = [];
  for (let i = 1; i <= 8; i++) {
    const username = 'staff' + i;
    staffAccounts.push({ username, role: 'teacher', staff_id: i });
    links.push({ lantern_username: username, tms_staff_id: 'L' + i, lantern_staff_id: i });
    tmsStaff.push({ teacher_id: 'L' + i });
  }
  // 14 staff events across 8 staff (some have multiple polls)
  const staffPairs = [
    [1, 'p1'], [1, 'p2'], [1, 'p3'],
    [2, 'p1'], [2, 'p2'],
    [3, 'p1'],
    [4, 'p1'], [4, 'p2'],
    [5, 'p1'],
    [6, 'p1'], [6, 'p2'],
    [7, 'p1'],
    [8, 'p1'], [8, 'p2'],
  ];
  for (const [n, poll] of staffPairs) {
    const key = 'staff:staff' + n;
    staffVotes.push({ poll_id: poll, character_name: key });
    staffRewards.push({ poll_id: poll, character_name: key });
  }

  const studentAccounts = [];
  const tmsStudents = [];
  const studentVotes = [];
  const studentRewards = [];
  const studentTxns = [];
  for (let i = 1; i <= 9; i++) {
    const sid = 'S' + String(100 + i);
    studentAccounts.push({
      username: sid,
      role: 'student',
      mtss_student_id: sid,
      student_character_name: sid,
    });
    tmsStudents.push({ student_id: sid, student_name: 'Student ' + i, is_active: 1 });
    const poll = i <= 4 ? 'p1' : 'p2';
    studentVotes.push({ poll_id: poll, character_name: sid });
    studentRewards.push({ poll_id: poll, character_name: sid });
  }
  // First 4 students already have the old global poll_vote ref (the #169 theft pattern).
  for (let i = 1; i <= 4; i++) {
    const sid = 'S' + String(100 + i);
    studentTxns.push({
      reference: 'lantern:poll_vote:p1',
      student_id: sid,
      delta: 1,
      kind: 'poll_vote',
    });
  }

  const polls = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  return {
    polls,
    votes: staffVotes.concat(studentVotes),
    voterRewards: staffRewards.concat(studentRewards),
    lanternAccounts: staffAccounts.concat(studentAccounts),
    identityLinks: links,
    tmsStudents,
    tmsStaff,
    tmsStudentPollTxns: studentTxns,
    tmsStaffPollTxns: [],
    lanternWallets: [
      { character_name: 'staff:staff1', balance: 3 },
      { character_name: 'staff:staff2', balance: 2 },
    ],
    ...overrides,
  };
}

// 1. exact #169 candidate reconstruction
const plan = reconstructHistoricalPollRewardCandidates(baseSnapshot());
if (plan.counts.staff === 14 && plan.counts.student === 5 && plan.counts.total === 19 && plan.counts.totalDelta === 19) {
  ok('1. exact #169 candidate reconstruction (14 staff + 5 student = 19 / +19)');
} else bad('1 reconstruction', plan.counts);

// 2. staff candidate requires exact TMS staff link
const noLink = reconstructHistoricalPollRewardCandidates(
  baseSnapshot({ identityLinks: [] })
);
if (noLink.counts.staff === 0 && noLink.unresolved.some((u) => u.reason === 'no_exact_tms_staff_link')) {
  ok('2. staff candidate requires exact TMS staff link');
} else bad('2 staff link', { counts: noLink.counts, unresolved: noLink.unresolved.slice(0, 2) });

// 3. student candidate requires exact student identity
const noStudent = reconstructHistoricalPollRewardCandidates(
  baseSnapshot({ lanternAccounts: baseSnapshot().lanternAccounts.filter((a) => a.role !== 'student') })
);
if (noStudent.counts.student === 0 && noStudent.unresolved.some((u) => u.principalType === 'student')) {
  ok('3. student candidate requires exact student identity');
} else bad('3 student ident', noStudent.counts);

// 4. fuzzy identity rejected
const fuzzy = resolveExactStudentIdentity('Alex', [
  { username: 'S101', role: 'student', mtss_student_id: 'S101', student_character_name: 'Alexander' },
]);
const fuzzyStaff = resolveExactStaffIdentity('staff:alex', [
  { lantern_username: 'alexander.smith', tms_staff_id: 'L99' },
]);
if (!fuzzy.ok && !fuzzyStaff.ok) ok('4. fuzzy identity rejected');
else bad('4 fuzzy', { fuzzy, fuzzyStaff });

// 5. already-existing canonical Poll reward excluded
const withCanonical = baseSnapshot();
withCanonical.tmsStaffPollTxns = [
  { reference: pollCompleteReference('p1', 'staff:staff3'), tms_staff_id: 'L3', delta: 1, kind: 'poll_complete' },
];
const planCanon = reconstructHistoricalPollRewardCandidates(withCanonical);
if (planCanon.counts.staff === 13 && !planCanon.candidates.some((c) => c.accountKey === 'staff:staff3' && c.pollId === 'p1')) {
  ok('5. already-existing canonical Poll reward excluded');
} else bad('5 canonical exclude', planCanon.counts);

// 6. one Poll/account pair produces +1
if (plan.candidates.every((c) => c.delta === 1) && EXPECTED_DELTA_EACH === 1) ok('6. one Poll/account pair produces +1');
else bad('6 plus one');

// 7. staff uses staff ledger
const staffSpec = applySpecForCandidate(plan.staffCandidates[0]);
if (plan.staffCandidates[0].principalType === 'staff' && staffSpec.characterName.startsWith('staff:')) {
  ok('7. staff uses staff ledger key');
} else bad('7 staff ledger');

// 8. student uses student ledger
const studentSpec = applySpecForCandidate(plan.studentCandidates[0]);
if (plan.studentCandidates[0].principalType === 'student' && !studentSpec.characterName.startsWith('staff:')) {
  ok('8. student uses student ledger key');
} else bad('8 student ledger');

// 9. old lantern_wallets staff row does not suppress TMS correction
if (plan.candidates.some((c) => c.accountKey === 'staff:staff1' && c.historicalWallet.present && !c.hasAuthoritativeReward)) {
  ok('9. old lantern_wallets staff row does not suppress authoritative TMS correction');
} else bad('9 wallet suppress');

// 10. old lantern_wallets staff row is not deleted
if (!/DELETE\s+FROM\s+lantern_wallets/i.test(moduleSrc) && !/DELETE\s+FROM\s+lantern_wallets/i.test(scriptSrc)) {
  ok('10. old lantern_wallets staff row is not deleted');
} else bad('10 wallet delete');

// 11. old global Poll reference does not prevent new per-account correction
const otherStudent = plan.candidates.find((c) => c.principalType === 'student' && c.pollId === 'p1');
const firstPaid = findAuthoritativePollReward(
  { pollId: 'p1', accountKey: 'S101', principalType: 'student', studentId: 'S101' },
  baseSnapshot().tmsStudentPollTxns,
  []
);
if (firstPaid && !otherStudent && plan.counts.student === 5) {
  ok('11. old global Poll reference does not prevent new per-account correction');
} else if (!firstPaid) {
  bad('11 expected first student to keep legacy credit');
} else if (plan.studentCandidates.every((c) => c.pollId === 'p2' || (c.pollId === 'p1' && c.studentId !== 'S101'))) {
  ok('11. old global Poll reference does not prevent new per-account correction');
} else bad('11 global ref', { otherStudent, student: plan.counts.student, ids: plan.studentCandidates.map((c) => c.studentId + ':' + c.pollId) });

// 12. canonical reference uses Poll + account
const ref = canonicalPollCompleteReference('p1', 'staff:staff1');
if (ref === 'lantern:poll_complete:p1:staff:staff1' && ref !== legacyGlobalPollVoteReference('p1')) {
  ok('12. canonical reference uses Poll + account');
} else bad('12 ref', ref);

// 13. duplicate APPLY gives no second credit
async function withMockedBridge(behavior, fn) {
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
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

await withMockedBridge((call) => {
  if (!call.url.endsWith('/economy/transact')) return { body: { ok: false } };
  const seen = withMockedBridge._seen || (withMockedBridge._seen = new Set());
  const key = call.body.reference + '|' + (call.body.tms_staff_id || call.body.student_id);
  if (seen.has(key)) {
    return { body: { ok: true, idempotent: true, delta: 1, available: 4, tms_staff_id: call.body.tms_staff_id, student_id: call.body.student_id } };
  }
  seen.add(key);
  return { body: { ok: true, idempotent: false, delta: 1, available: 3, tms_staff_id: call.body.tms_staff_id, student_id: call.body.student_id } };
}, async (calls) => {
  const env = { TMS_LANTERN_BRIDGE_SECRET: 'test-bridge-secret-not-real' };
  const db = {
    prepare(sql) {
      const s = String(sql);
      return {
        bind() { return this; },
        async first() {
          if (/tms_identity_links/.test(s)) return { tms_staff_id: plan.staffCandidates[0].tmsStaffId };
          return null;
        },
        async run() { return { success: true }; },
      };
    },
  };
  const candidate = plan.staffCandidates[0];
  const a = await creditHistoricalPollReward(db, env, candidate);
  const b = await creditHistoricalPollReward(db, env, candidate);
  if (a.ok && a.status === 'granted' && b.ok && (b.status === 'idempotent' || b.idempotent) && calls.filter((c) => c.body && c.body.reference === candidate.canonicalReference).length === 2) {
    ok('13. duplicate APPLY gives no second credit');
  } else bad('13 idempotent apply', { a, b, calls });
});

// 14. dry run makes no writes
if (
  /MODE: DRY RUN/.test(scriptSrc) &&
  /allowWrite: false/.test(scriptSrc) &&
  /dry-run refused non-SELECT/.test(scriptSrc) &&
  /if \(!args\.apply\)/.test(scriptSrc)
) {
  ok('14. dry run makes no writes');
} else bad('14 dry run');

// 15/16. apply refuses unless expected candidate count matches configured gate
const mismatch = evaluateApplyGate({
  candidates: plan.candidates.slice(0, 18),
  unresolved: [],
  counts: { staff: 14, student: 4, total: 18, totalDelta: 18 },
});
const match = evaluateApplyGate(plan);
if (!mismatch.ok && /student_count_4/.test(mismatch.reasons.join(',')) && match.ok) {
  ok('15. apply refuses unless expected candidate count matches configured gate');
  ok('16. candidate count mismatch stops');
} else bad('15/16 gate', { mismatch, match });

// 17. amount always exactly +1
if (plan.candidates.every((c) => c.delta === 1) && EXPECTED_DELTA_EACH === 1) ok('17. amount always exactly +1');
else bad('17 amount');

// 18. total expected delta = +19
if (EXPECTED_TOTAL_DELTA === 19 && plan.counts.totalDelta === 19) ok('18. total expected delta = +19');
else bad('18 total delta');

// 19. no balance SET statements
if (!/UPDATE\s+\w*balance/i.test(moduleSrc) && !/SET\s+nuggets/i.test(scriptSrc) && !/SET\s+balance\s*=/i.test(scriptSrc) && !/SET\s+balance\s*=/i.test(moduleSrc)) {
  ok('19. no balance SET statements');
} else bad('19 balance set');

// 20. no account creation
if (!/INSERT INTO students/i.test(scriptSrc) && !/INSERT INTO staff\b/i.test(scriptSrc) && !/INSERT INTO lantern_pilot_accounts/i.test(scriptSrc)) {
  ok('20. no account creation');
} else bad('20 account create');

// 21. no fuzzy linking
if (!/levenshtein|fuzzyMatch|display_name ===|first_name ===|last_name ===/i.test(moduleSrc)) {
  ok('21. no fuzzy linking');
} else bad('21 fuzzy');

// 22. no historical Poll state mutation
if (
  !/UPDATE\s+lantern_polls/i.test(scriptSrc) &&
  !/UPDATE\s+lantern_poll_votes/i.test(scriptSrc) &&
  !/DELETE\s+FROM\s+lantern_poll/i.test(scriptSrc) &&
  !/INSERT INTO lantern_poll_voter_rewards/i.test(scriptSrc)
) {
  ok('22. no historical Poll state mutation');
} else bad('22 poll mutation');

// 23–27 static preservation of landed contracts
const contract169 = read('worker/scripts/nugget-economy-contract-169-test.mjs');
const contract170 = read('worker/scripts/nugget-balance-contract-170-test.mjs');
const staffStarter = read('worker/staff-starter-nuggets.js');
const paidRun = read('worker/game-paid-run-proof.js');
const edu = read('app/js/lantern-educational-trivia-missions.js');
if (/pollCompleteReference/.test(contract169) && /classifyPollReward/.test(contract169)) ok('23. #169 Poll behavior remains in contract suite');
else bad('23 #169');
if (/GET \/api\/economy\/balance/.test(contract170) || /resolveEconomyBalanceRead/.test(contract170)) ok('24. #170 balance-read behavior remains in contract suite');
else bad('24 #170');
if (/STAFF_STARTER_KIND/.test(staffStarter) && /staffStarterReference/.test(staffStarter)) ok('25. Staff Starter remains green (source intact)');
else bad('25 staff starter');
if (/game_play/.test(paidRun)) ok('26. paid-run #159 remains green (source intact)');
else bad('26 #159');
if (/perm_local_history_trivia/.test(edu) && /perm_srp_safety/.test(edu)) ok('27. Trinidad/SRP economy remains green (source intact)');
else bad('27 trinidad/srp');

// Extra contract locks
if (EXPECTED_STAFF_CANDIDATES === 14 && EXPECTED_STUDENT_CANDIDATES === 5 && EXPECTED_TOTAL_CANDIDATES === 19) {
  ok('gate constants are 14 + 5 = 19');
} else bad('gate constants');
if (POLL_COMPLETE_KIND === 'poll_complete' && BACKFILL_SOURCE === 'poll_reward_backfill_173') ok('kind/source labels');
else bad('labels');
if (!scriptSrc.includes('lantern:poll_vote:') || /legacy|LIKE 'lantern:poll_vote:%'/.test(scriptSrc)) {
  ok('script does not resurrect lantern:poll_vote as the new write reference');
} else bad('legacy write ref');
if (/allowLegacyWallet: false/.test(moduleSrc) && /tmsStaffEconomyTransact/.test(applySrc)) {
  ok('apply helper forbids lantern_wallets fallback');
} else bad('legacy wallet fallback');
if (classifyPollReward({ hasVote: true, hasLocalVoterReward: true, hasTmsTransaction: false }).backfill === 'deterministic') {
  ok('#169 classifier still marks local-marker-without-TMS as deterministic');
} else bad('classifier');

const deltas = expectedBalanceDeltaByPrincipal(plan.candidates);
if (deltas['staff:L1'] === 3 && Object.values(deltas).reduce((a, b) => a + b, 0) === 19) {
  ok('per-principal balance delta can exceed +1 when a staff member has multiple misses');
} else bad('per-principal deltas', deltas);

await withMockedBridge((call) => {
  if (call.body && call.body.principal_type === 'staff') {
    if (call.body.student_id) return { body: { ok: false, error: 'staff_used_student_id' } };
    return { body: { ok: true, tms_staff_id: call.body.tms_staff_id, delta: 1, available: 5 } };
  }
  if (call.body && String(call.body.student_id || '').startsWith('staff:')) {
    return { httpOk: false, status: 404, body: { ok: false, error: 'student_not_found' } };
  }
  return { body: { ok: true, student_id: call.body.student_id, delta: 1, available: 2 } };
}, async (calls) => {
  const env = { TMS_LANTERN_BRIDGE_SECRET: 'test-bridge-secret-not-real' };
  const inserts = [];
  const db = {
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...args) {
          if (/INSERT INTO lantern_wallets/i.test(s)) inserts.push(['wallet', args]);
          if (/DELETE FROM lantern_wallets/i.test(s)) inserts.push(['wallet_delete', args]);
          if (/INSERT INTO lantern_transactions/i.test(s)) inserts.push(['tx', args]);
          return this;
        },
        async first() {
          if (/tms_identity_links/.test(s)) return { tms_staff_id: 'L1' };
          return null;
        },
        async run() { return { success: true }; },
      };
    },
  };
  const staff = await applyAuthoritativeNuggetDelta(db, env, applySpecForCandidate(plan.staffCandidates[0]));
  const student = await applyAuthoritativeNuggetDelta(db, env, applySpecForCandidate(plan.studentCandidates[0]));
  const staffCall = calls.find((c) => c.body && c.body.principal_type === 'staff');
  const studentCall = calls.find((c) => c.body && c.body.student_id && !c.body.principal_type);
  if (
    staff.ok &&
    staff.authority === 'tms_nuggets_staff' &&
    student.ok &&
    student.authority === 'tms_nuggets' &&
    staffCall &&
    studentCall &&
    !inserts.some((i) => i[0] === 'wallet' || i[0] === 'wallet_delete') &&
    staffCall.body.kind === 'poll_complete' &&
    staffCall.body.delta === 1 &&
    studentCall.body.delta === 1 &&
    String(staffCall.body.note).includes(BACKFILL_NOTE) &&
    staffCall.body.reference === plan.staffCandidates[0].canonicalReference
  ) {
    ok('apply uses TMS staff/student paths, +1, canonical ref, no lantern_wallets write');
  } else bad('apply paths', { staff, student, staffCall, studentCall, inserts });
});

if (/--apply/.test(scriptSrc) && /evaluateApplyGate/.test(scriptSrc) && /APPLY REFUSED/.test(scriptSrc)) {
  ok('CLI apply is gated on the exact 19-candidate set');
} else bad('CLI gate');

if (classifyVoteKey('char2') === 'demo_persona' && classifyVoteKey('test_abc') === 'demo_persona' && classifyVoteKey('20889') === 'numeric_student_id') {
  ok('demo persona vote keys are classified and cannot be fuzzy-promoted to students');
} else bad('key class');

console.log(`\npoll-reward-backfill-173-test: ${pass} PASS ${fail} FAIL`);
if (fail) process.exit(1);
