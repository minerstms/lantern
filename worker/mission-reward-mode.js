/**
 * Prompt #257C2 — Mission reward frequency (once vs every completion).
 * Stored in lantern_settings: activity.reward_mode.<missionId>
 * Default: once (backward compatible).
 */
import { clampMissionRewardAmount } from './mission-reward-bands.js';

export const REWARD_MODE_ONCE = 'once';
export const REWARD_MODE_EVERY = 'every_completion';

export function rewardModeSettingKey(missionId) {
  return `activity.reward_mode.${String(missionId || '').trim()}`;
}

/** @returns {'once'|'every_completion'} */
export function normalizeRewardMode(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === REWARD_MODE_EVERY || s === 'every' || s === 'every completion') return REWARD_MODE_EVERY;
  return REWARD_MODE_ONCE;
}

export function isEveryCompletionMode(mode) {
  return normalizeRewardMode(mode) === REWARD_MODE_EVERY;
}

export async function getMissionRewardMode(db, missionId) {
  const id = String(missionId || '').trim();
  if (!db || !id) return REWARD_MODE_ONCE;
  try {
    const row = await db.prepare('SELECT value FROM lantern_settings WHERE key = ?').bind(rewardModeSettingKey(id)).first();
    return normalizeRewardMode(row && row.value);
  } catch (_) {
    return REWARD_MODE_ONCE;
  }
}

export async function resolveMissionRewardMode(db, missionId) {
  return getMissionRewardMode(db, missionId);
}

export async function setMissionRewardMode(db, missionId, mode, updatedBy) {
  const id = String(missionId || '').trim();
  if (!db || !id) return { ok: false, error: 'missing_mission' };
  const normalized = normalizeRewardMode(mode);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(rewardModeSettingKey(id), normalized, now, updatedBy || null)
    .run();
  return { ok: true, reward_mode: normalized };
}

export function formatRewardModeAdminPreview(rewardAmount, mode) {
  const reward = clampMissionRewardAmount(rewardAmount);
  const noun = reward === 1 ? 'Nugget' : 'Nuggets';
  if (isEveryCompletionMode(mode)) {
    return `+${reward} ${noun} every completion`;
  }
  return `+${reward} ${noun} when completed`;
}

export function formatRewardModeStudentLabel(mode) {
  return isEveryCompletionMode(mode) ? 'every completion' : 'earn once';
}

export async function attachRewardModesToMissions(db, missions) {
  if (!Array.isArray(missions) || !missions.length) return missions;
  for (const m of missions) {
    if (!m || !m.id) continue;
    const mode = await getMissionRewardMode(db, m.id);
    m.reward_mode = mode;
  }
  return missions;
}
