/**
 * Prompt #257C — Mission reward bands and validation (server-authoritative).
 *
 * Legal ordinary Mission completion reward: 1–10 Nuggets.
 * Suggested reward from minimum writing length (staff may override).
 */

export const MISSION_REWARD_MIN = 1;
export const MISSION_REWARD_MAX = 10;

export const MISSION_MIN_PRESETS = [100, 200, 500, 1000];

/** @returns {number} Suggested reward for a minimum character requirement. */
export function suggestedMissionReward(minCharacters) {
  const n = Math.max(0, Math.floor(Number(minCharacters)) || 0);
  if (n >= 1000) return 10;
  if (n >= 500) return 5;
  if (n >= 200) return 2;
  if (n >= 1) return 1;
  return 1;
}

/** Clamp stored/final mission reward to legal range. Legacy 0 reads as 0 payout only when explicitly stored. */
export function clampMissionRewardAmount(raw, opts) {
  const allowZero = opts && opts.allowLegacyZero;
  if (raw == null || raw === '') return suggestedMissionReward(100);
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return suggestedMissionReward(100);
  if (allowZero && n === 0) return 0;
  if (n < MISSION_REWARD_MIN) return MISSION_REWARD_MIN;
  if (n > MISSION_REWARD_MAX) return MISSION_REWARD_MAX;
  return n;
}

/** Ordinary authored/submission missions require min_characters > 0 on create/edit. */
export function validateOrdinaryMissionMinCharacters(minCharacters, missionKind) {
  const kind = String(missionKind || 'submission').trim();
  if (kind === 'event' || kind === 'trivia' || kind === 'progressive') {
    return { ok: true, value: Math.max(0, Math.floor(Number(minCharacters)) || 0) };
  }
  const n = Math.floor(Number(minCharacters));
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, error: 'min_characters_required', min: 1 };
  }
  if (n > 10000) return { ok: false, error: 'min_characters_too_large', max: 10000 };
  return { ok: true, value: n };
}

export function formatMissionStudentPreview(minCharacters, rewardAmount, requireImage) {
  const parts = [];
  if (requireImage) parts.push('📷 Image required');
  const min = Math.max(0, Math.floor(Number(minCharacters)) || 0);
  if (min > 0) parts.push(min + '+ characters');
  const reward = clampMissionRewardAmount(rewardAmount);
  if (reward > 0) {
    parts.push('+' + reward + (reward === 1 ? ' Nugget' : ' Nuggets'));
  }
  return parts.join(' · ');
}
