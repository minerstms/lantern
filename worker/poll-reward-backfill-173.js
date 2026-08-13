/**
 * Prompt #173 — reconstruct and credit the #169 deterministic historical Poll +1 misses.
 *
 * Read-only reconstruction. Writes go only through applyAuthoritativeNuggetDelta
 * (TMS student or staff ledger) using lantern:poll_complete:<poll_id>:<account_key>.
 *
 * Never: balance SET, fuzzy identity, account create/merge, lantern_wallets cleanup,
 * Poll vote/content/marker mutation, or any reward other than these Poll +1s.
 */
import { classifyPollReward } from './nugget-economy-reconcile.js';
import { pollCompleteReference } from './poll-completion-reward.js';
import { applyAuthoritativeNuggetDelta } from './tms-economy-apply.js';
import { isStaffEconomyKey, parseStaffEconomyKey, parseStaffIdEconomyKey } from './staff-economy.js';

export const BACKFILL_SOURCE = 'poll_reward_backfill_173';
export const BACKFILL_NOTE = 'Lantern historical Poll completion reward reconciliation';
export const POLL_COMPLETE_KIND = 'poll_complete';
export const EXPECTED_STAFF_CANDIDATES = 14;
export const EXPECTED_STUDENT_CANDIDATES = 5;
export const EXPECTED_TOTAL_CANDIDATES = 19;
export const EXPECTED_DELTA_EACH = 1;
export const EXPECTED_TOTAL_DELTA = 19;

export function canonicalPollCompleteReference(pollId, accountKey) {
  return pollCompleteReference(pollId, accountKey);
}

export function legacyGlobalPollVoteReference(pollId) {
  return 'lantern:poll_vote:' + String(pollId || '').trim();
}

function norm(v) {
  return String(v == null ? '' : v).trim();
}

function lower(v) {
  return norm(v).toLowerCase();
}

function isActiveFlag(v) {
  if (v == null || v === '') return true;
  if (v === true || v === 1) return true;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true';
}

/**
 * Exact student identity only: vote key must equal mtss_student_id, or equal
 * student_character_name on an account that already has mtss_student_id.
 * No display-name / first / last / username guessing.
 */
export function resolveExactStudentIdentity(accountKey, lanternAccounts) {
  const key = norm(accountKey);
  if (!key) return { ok: false, reason: 'missing_account_key' };
  if (isStaffEconomyKey(key)) return { ok: false, reason: 'staff_key_not_student' };

  const students = (lanternAccounts || []).filter((a) => lower(a.role) === 'student');
  const bySid = students.filter((a) => norm(a.mtss_student_id) === key);
  if (bySid.length > 1) return { ok: false, reason: 'ambiguous_lantern_student_id' };
  if (bySid.length === 1) {
    return { ok: true, studentId: key, username: norm(bySid[0].username) };
  }

  const byScn = students.filter(
    (a) => norm(a.student_character_name) === key && !!norm(a.mtss_student_id)
  );
  if (byScn.length > 1) return { ok: false, reason: 'ambiguous_lantern_character_name' };
  if (byScn.length === 1) {
    return { ok: true, studentId: norm(byScn[0].mtss_student_id), username: norm(byScn[0].username) };
  }

  return { ok: false, reason: 'no_exact_student_identity' };
}

/**
 * Exact staff identity: staff:username or staff_id:N → tms_identity_links → tms_staff_id.
 */
export function resolveExactStaffIdentity(accountKey, identityLinks, lanternAccounts) {
  const key = norm(accountKey);
  const staffIdKey = parseStaffIdEconomyKey(key);
  if (staffIdKey) {
    const hits = (identityLinks || []).filter((l) => Number(l.lantern_staff_id) === staffIdKey && norm(l.tms_staff_id));
    if (hits.length === 1) return { ok: true, tmsStaffId: norm(hits[0].tms_staff_id), lanternUsername: norm(hits[0].lantern_username) };
    if (hits.length > 1) return { ok: false, reason: 'ambiguous_staff_id_link' };
    const viaAccount = (lanternAccounts || []).find((a) => Number(a.staff_id) === staffIdKey);
    if (viaAccount) {
      const uname = lower(viaAccount.username);
      const viaUser = (identityLinks || []).filter((l) => lower(l.lantern_username) === uname && norm(l.tms_staff_id));
      if (viaUser.length === 1) return { ok: true, tmsStaffId: norm(viaUser[0].tms_staff_id), lanternUsername: norm(viaUser[0].lantern_username) };
      if (viaUser.length > 1) return { ok: false, reason: 'ambiguous_staff_username_link' };
    }
    return { ok: false, reason: 'no_exact_tms_staff_link' };
  }

  const uname = parseStaffEconomyKey(key);
  if (!uname) return { ok: false, reason: 'not_staff_key' };
  const hits = (identityLinks || []).filter((l) => lower(l.lantern_username) === lower(uname) && norm(l.tms_staff_id));
  if (hits.length === 1) return { ok: true, tmsStaffId: norm(hits[0].tms_staff_id), lanternUsername: norm(hits[0].lantern_username) };
  if (hits.length > 1) return { ok: false, reason: 'ambiguous_staff_username_link' };
  return { ok: false, reason: 'no_exact_tms_staff_link' };
}

export function resolveExactTmsStudent(studentId, tmsStudents) {
  const sid = norm(studentId);
  if (!sid) return { ok: false, reason: 'missing_student_id' };
  const matches = (tmsStudents || []).filter((s) => norm(s.student_id) === sid);
  if (!matches.length) return { ok: false, reason: 'tms_student_not_found' };
  const active = matches.filter((s) => isActiveFlag(s.is_active));
  if (!active.length) return { ok: false, reason: 'tms_student_archived' };
  if (active.length > 1) return { ok: false, reason: 'ambiguous_tms_student_id' };
  return { ok: true, studentId: sid, studentName: norm(active[0].student_name) };
}

export function resolveExactTmsStaff(tmsStaffId, tmsStaff) {
  const id = norm(tmsStaffId);
  if (!id) return { ok: false, reason: 'missing_tms_staff_id' };
  const hits = (tmsStaff || []).filter((s) => norm(s.teacher_id) === id);
  if (!hits.length) return { ok: false, reason: 'tms_staff_not_found' };
  return { ok: true, tmsStaffId: id };
}

function refsForPollAccount(pollId, accountKey) {
  const canonical = canonicalPollCompleteReference(pollId, accountKey);
  const legacyVote = legacyGlobalPollVoteReference(pollId);
  const legacyCompleteGlobal = 'lantern:poll_complete:' + norm(pollId);
  return { canonical, legacyVote, legacyCompleteGlobal };
}

/**
 * Authoritative TMS reward for this exact Poll/account principal.
 * Old global lantern:poll_vote:<poll_id> counts only when credited to THIS principal.
 * A global ref on a different voter does not suppress this account's correction.
 * lantern_wallets is ignored.
 */
export function findAuthoritativePollReward(spec, tmsStudentTxns, tmsStaffTxns) {
  const pollId = norm(spec && spec.pollId);
  const accountKey = norm(spec && spec.accountKey);
  const { canonical, legacyVote, legacyCompleteGlobal } = refsForPollAccount(pollId, accountKey);

  function refMatches(ref) {
    const r = norm(ref);
    if (r === canonical) return true;
    if (r === legacyVote) return true;
    if (r === legacyCompleteGlobal) return true;
    return false;
  }

  if ((spec && spec.principalType) === 'staff') {
    const staffId = norm(spec.tmsStaffId);
    const hit = (tmsStaffTxns || []).find(
      (t) => norm(t.tms_staff_id) === staffId && refMatches(t.reference)
    );
    return hit || null;
  }

  const studentId = norm(spec && spec.studentId);
  const hit = (tmsStudentTxns || []).find(
    (t) => norm(t.student_id) === studentId && refMatches(t.reference)
  );
  return hit || null;
}

function hasLocalReward(voterRewards, pollId, accountKey) {
  return (voterRewards || []).some(
    (r) => norm(r.poll_id) === norm(pollId) && norm(r.character_name) === norm(accountKey)
  );
}

function pollExists(polls, pollId) {
  return (polls || []).some((p) => norm(p.id) === norm(pollId));
}

export function classifyVoteKey(accountKey) {
  const key = norm(accountKey);
  if (isStaffEconomyKey(key)) return 'staff';
  if (/^char\d+$/i.test(key) || /^test_/i.test(key)) return 'demo_persona';
  if (/^\d+$/.test(key)) return 'numeric_student_id';
  return 'other';
}

/**
 * Reconstruct #169 deterministic historical Poll reward candidates from snapshots.
 * Does not write. Does not infer from balances.
 */
export function reconstructHistoricalPollRewardCandidates(snapshot) {
  snapshot = snapshot || {};
  const polls = snapshot.polls || [];
  const votes = snapshot.votes || [];
  const voterRewards = snapshot.voterRewards || [];
  const lanternAccounts = snapshot.lanternAccounts || [];
  const identityLinks = snapshot.identityLinks || [];
  const tmsStudents = snapshot.tmsStudents || [];
  const tmsStaff = snapshot.tmsStaff || [];
  const tmsStudentPollTxns = snapshot.tmsStudentPollTxns || [];
  const tmsStaffPollTxns = snapshot.tmsStaffPollTxns || [];
  const lanternWallets = snapshot.lanternWallets || [];

  const candidates = [];
  const excluded = [];
  const unresolved = [];
  const recoverable = [];
  const otherFindings = [];

  for (const vote of votes) {
    const pollId = norm(vote.poll_id);
    const accountKey = norm(vote.character_name);
    const local = hasLocalReward(voterRewards, pollId, accountKey);
    const exists = pollExists(polls, pollId);
    const staff = isStaffEconomyKey(accountKey);

    if (!exists) {
        unresolved.push({
          pollId,
          accountKey,
          principalType: staff ? 'staff' : 'student',
          keyClass: classifyVoteKey(accountKey),
          reason: 'poll_missing',
        });
      continue;
    }

    if (staff) {
      const link = resolveExactStaffIdentity(accountKey, identityLinks, lanternAccounts);
      if (!link.ok) {
        if (local) {
          unresolved.push({
            pollId,
            accountKey,
            principalType: 'staff',
            keyClass: classifyVoteKey(accountKey),
            reason: link.reason,
            classification: classifyPollReward({
              hasVote: true,
              hasLocalVoterReward: local,
              hasTmsTransaction: false,
              linked: false,
              accountKey,
            }),
          });
        } else {
          recoverable.push({ pollId, accountKey, principalType: 'staff', reason: 'unlinked_or_unresolved_without_marker' });
        }
        continue;
      }
      const staffRow = resolveExactTmsStaff(link.tmsStaffId, tmsStaff);
      if (!staffRow.ok) {
        unresolved.push({
          pollId,
          accountKey,
          principalType: 'staff',
          keyClass: classifyVoteKey(accountKey),
          reason: staffRow.reason,
          tmsStaffId: link.tmsStaffId,
        });
        continue;
      }
      const tmsRow = findAuthoritativePollReward(
        { pollId, accountKey, principalType: 'staff', tmsStaffId: link.tmsStaffId },
        tmsStudentPollTxns,
        tmsStaffPollTxns
      );
      const classified = classifyPollReward({
        hasVote: true,
        hasLocalVoterReward: local,
        hasTmsTransaction: !!tmsRow,
        tmsAmount: tmsRow ? Number(tmsRow.delta) : null,
        linked: true,
        accountKey,
      });
      const wallet = (lanternWallets || []).find((w) => norm(w.character_name) === accountKey);
      const record = {
        pollId,
        accountKey,
        principalType: 'staff',
        tmsStaffId: link.tmsStaffId,
        lanternUsername: link.lanternUsername,
        linkStatus: 'exact_tms_staff_link',
        canonicalReference: canonicalPollCompleteReference(pollId, accountKey),
        hasLocalVoterReward: local,
        hasAuthoritativeReward: !!tmsRow,
        authoritativeReference: tmsRow ? norm(tmsRow.reference) : null,
        historicalWallet: wallet ? { present: true, balance: Number(wallet.balance) || 0 } : { present: false },
        classification: classified,
        delta: EXPECTED_DELTA_EACH,
        kind: POLL_COMPLETE_KIND,
      };
      if (classified.backfill === 'deterministic') {
        candidates.push(record);
      } else if (classified.reason === 'recoverable_on_reload_after_169') {
        recoverable.push(record);
      } else {
        excluded.push(record);
      }
      continue;
    }

    const ident = resolveExactStudentIdentity(accountKey, lanternAccounts);
    if (!ident.ok) {
      if (local) {
        unresolved.push({
          pollId,
          accountKey,
          principalType: 'student',
          keyClass: classifyVoteKey(accountKey),
          reason: ident.reason,
        });
      } else {
        recoverable.push({ pollId, accountKey, principalType: 'student', reason: ident.reason });
      }
      continue;
    }
    const tmsStudent = resolveExactTmsStudent(ident.studentId, tmsStudents);
    if (!tmsStudent.ok) {
      unresolved.push({
        pollId,
        accountKey,
        principalType: 'student',
        keyClass: classifyVoteKey(accountKey),
        reason: tmsStudent.reason,
        studentId: ident.studentId,
      });
      continue;
    }
    const tmsRow = findAuthoritativePollReward(
      { pollId, accountKey, principalType: 'student', studentId: ident.studentId },
      tmsStudentPollTxns,
      tmsStaffPollTxns
    );
    const classified = classifyPollReward({
      hasVote: true,
      hasLocalVoterReward: local,
      hasTmsTransaction: !!tmsRow,
      tmsAmount: tmsRow ? Number(tmsRow.delta) : null,
      linked: true,
      accountKey,
    });
    const record = {
      pollId,
      accountKey,
      principalType: 'student',
      studentId: ident.studentId,
      studentName: tmsStudent.studentName,
      linkStatus: 'exact_tms_student_id',
      canonicalReference: canonicalPollCompleteReference(pollId, accountKey),
      hasLocalVoterReward: local,
      hasAuthoritativeReward: !!tmsRow,
      authoritativeReference: tmsRow ? norm(tmsRow.reference) : null,
      historicalWallet: { present: false },
      classification: classified,
      delta: EXPECTED_DELTA_EACH,
      kind: POLL_COMPLETE_KIND,
    };
    if (classified.backfill === 'deterministic') {
      candidates.push(record);
    } else if (classified.reason === 'recoverable_on_reload_after_169') {
      recoverable.push(record);
    } else {
      excluded.push(record);
    }
  }

  const staffCandidates = candidates.filter((c) => c.principalType === 'staff');
  const studentCandidates = candidates.filter((c) => c.principalType === 'student');
  const totalDelta = candidates.reduce((n, c) => n + (Number(c.delta) || 0), 0);

  return {
    candidates,
    staffCandidates,
    studentCandidates,
    excluded,
    unresolved,
    recoverable,
    otherFindings,
    counts: {
      staff: staffCandidates.length,
      student: studentCandidates.length,
      total: candidates.length,
      deltaEach: EXPECTED_DELTA_EACH,
      totalDelta,
      unresolved: unresolved.length,
    },
  };
}

export function evaluateApplyGate(plan) {
  const counts = (plan && plan.counts) || {};
  const reasons = [];
  if (Number(counts.staff) !== EXPECTED_STAFF_CANDIDATES) {
    reasons.push('staff_count_' + counts.staff + '_expected_' + EXPECTED_STAFF_CANDIDATES);
  }
  if (Number(counts.student) !== EXPECTED_STUDENT_CANDIDATES) {
    reasons.push('student_count_' + counts.student + '_expected_' + EXPECTED_STUDENT_CANDIDATES);
  }
  if (Number(counts.total) !== EXPECTED_TOTAL_CANDIDATES) {
    reasons.push('total_count_' + counts.total + '_expected_' + EXPECTED_TOTAL_CANDIDATES);
  }
  if (Number(counts.totalDelta) !== EXPECTED_TOTAL_DELTA) {
    reasons.push('total_delta_' + counts.totalDelta + '_expected_' + EXPECTED_TOTAL_DELTA);
  }
  if ((plan.unresolved || []).length) {
    reasons.push('unresolved_identities_' + plan.unresolved.length);
  }
  const badDelta = (plan.candidates || []).filter((c) => Number(c.delta) !== EXPECTED_DELTA_EACH);
  if (badDelta.length) reasons.push('non_plus_one_delta');
  const badKind = (plan.candidates || []).filter((c) => c.kind !== POLL_COMPLETE_KIND);
  if (badKind.length) reasons.push('non_poll_complete_kind');
  const badRef = (plan.candidates || []).filter((c) => {
    const expected = canonicalPollCompleteReference(c.pollId, c.accountKey);
    return c.canonicalReference !== expected || !String(c.canonicalReference).startsWith('lantern:poll_complete:');
  });
  if (badRef.length) reasons.push('non_canonical_reference');
  const legacyNew = (plan.candidates || []).filter((c) => String(c.canonicalReference).startsWith('lantern:poll_vote:'));
  if (legacyNew.length) reasons.push('legacy_poll_vote_reference');
  const missingLink = (plan.candidates || []).filter((c) => {
    if (c.principalType === 'staff') return c.linkStatus !== 'exact_tms_staff_link' || !c.tmsStaffId;
    return c.linkStatus !== 'exact_tms_student_id' || !c.studentId;
  });
  if (missingLink.length) reasons.push('identity_not_exact');
  const already = (plan.candidates || []).filter((c) => c.hasAuthoritativeReward);
  if (already.length) reasons.push('authoritative_reward_already_present');

  return {
    ok: reasons.length === 0,
    reasons,
    staff: Number(counts.staff) || 0,
    student: Number(counts.student) || 0,
    total: Number(counts.total) || 0,
    totalDelta: Number(counts.totalDelta) || 0,
  };
}

export function sanitizeCandidateForReport(candidate) {
  const c = candidate || {};
  const staff = c.principalType === 'staff';
  return {
    poll_id: c.pollId,
    principal_type: c.principalType,
    link_status: c.linkStatus,
    canonical_reference: staff
      ? c.canonicalReference
      : 'lantern:poll_complete:' + norm(c.pollId) + ':<student_account>',
    has_authoritative_reward: !!c.hasAuthoritativeReward,
    has_local_voter_reward: !!c.hasLocalVoterReward,
    historical_wallet_present: !!(c.historicalWallet && c.historicalWallet.present),
    delta: EXPECTED_DELTA_EACH,
    kind: POLL_COMPLETE_KIND,
  };
}

export function applySpecForCandidate(candidate) {
  const c = candidate || {};
  return {
    characterName: c.accountKey,
    delta: EXPECTED_DELTA_EACH,
    kind: POLL_COMPLETE_KIND,
    source: BACKFILL_SOURCE,
    note: BACKFILL_NOTE,
    reference: canonicalPollCompleteReference(c.pollId, c.accountKey),
    meta: {
      poll_id: c.pollId,
      account_key: c.accountKey,
      backfill: true,
      source: BACKFILL_SOURCE,
    },
    allowLegacyWallet: false,
  };
}

/**
 * Credit one approved candidate through the #169 authoritative helper.
 * Staff → TMS staff ledger. Student → TMS student ledger. No lantern_wallets.
 */
export async function creditHistoricalPollReward(db, env, candidate) {
  const spec = applySpecForCandidate(candidate);
  return applyAuthoritativeNuggetDelta(db, env, spec);
}

export function expectedBalanceDeltaByPrincipal(candidates) {
  const map = Object.create(null);
  for (const c of candidates || []) {
    const key =
      c.principalType === 'staff' ? 'staff:' + norm(c.tmsStaffId) : 'student:' + norm(c.studentId);
    map[key] = (map[key] || 0) + EXPECTED_DELTA_EACH;
  }
  return map;
}
