/**
 * Prompt #169 — reusable Nugget economy reconciliation (read-only classifier).
 *
 * Given an action identity + account, decide whether an authoritative TMS
 * transaction should exist and whether local markers match. Does not write.
 */
import { pollCompleteReference } from './poll-completion-reward.js';
import { missionRewardReference } from './missions-reward.js';
import { isStaffEconomyKey } from './staff-economy.js';

export const POLL_COMPLETE_KIND = 'poll_complete';

export function expectedPollReference(pollId, accountKey) {
  return pollCompleteReference(pollId, accountKey);
}

export function expectedMissionReference(submissionId) {
  return missionRewardReference(submissionId);
}

/**
 * Classify a poll participation vs reward vs TMS row.
 * @returns {{ status: string, backfill: 'none'|'deterministic'|'ambiguous', reason: string }}
 */
export function classifyPollReward(opts) {
  const vote = !!(opts && opts.hasVote);
  const localReward = !!(opts && opts.hasLocalVoterReward);
  const tmsTxn = !!(opts && opts.hasTmsTransaction);
  const amount = opts && opts.tmsAmount != null ? Number(opts.tmsAmount) : null;
  const linked = opts && opts.linked !== false;
  const staff = isStaffEconomyKey((opts && opts.accountKey) || '');

  if (!vote) {
    return { status: 'no_vote', backfill: 'none', reason: 'no_participation' };
  }
  if (!linked && staff) {
    return {
      status: 'needs_link',
      backfill: 'none',
      reason: 'unlinked_staff_must_not_receive_fake_success',
    };
  }
  if (tmsTxn && amount === 1) {
    return { status: 'healthy', backfill: 'none', reason: 'authoritative_credit_present' };
  }
  if (tmsTxn && amount != null && amount !== 1) {
    return { status: 'wrong_amount', backfill: 'none', reason: 'amount_mismatch' };
  }
  if (vote && !tmsTxn && !localReward) {
    return {
      status: 'missing_reward',
      backfill: 'none',
      reason: 'recoverable_on_reload_after_169',
    };
  }
  if (vote && localReward && !tmsTxn) {
    return {
      status: 'local_marker_without_tms',
      backfill: 'deterministic',
      reason: 'voter_rewards_row_without_matching_tms_reference',
    };
  }
  return { status: 'unknown', backfill: 'ambiguous', reason: 'insufficient_evidence' };
}
