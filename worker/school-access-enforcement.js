/**
 * Lantern Access — master school-schedule enforcement setting (#262).
 *
 * Authoritative storage: `lantern_settings` key `access.school_schedule_enforcement`.
 * Fallback: env `SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED` (legacy deploy toggle, default OFF).
 * No migration — reuses migration 055 `lantern_settings`.
 */

import { evaluateSchoolSchedule, SCHOOL_SCHEDULE_TIMEZONE } from './school-schedule.js';

export const ACCESS_ENFORCEMENT_SETTING_KEY = 'access.school_schedule_enforcement';

/** Production-safe default — enforcement remains OFF until Web Admin enables it. */
export const ACCESS_ENFORCEMENT_DEFAULT = false;

export function parseAccessEnforcementEnabled(raw) {
  if (raw == null || raw === '') return { ok: false, error: 'missing_value' };
  if (typeof raw === 'boolean') return { ok: true, value: raw };
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return { ok: true, value: true };
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') return { ok: true, value: false };
  return { ok: false, error: 'malformed' };
}

function envEnforcementEnabled(env) {
  return String((env && env.SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED) || '').trim().toLowerCase() === 'true';
}

/**
 * Resolve whether school-schedule enforcement is ON.
 * D1 setting wins when present; otherwise env fallback; otherwise OFF.
 * @returns {Promise<{ enabled: boolean, source: 'settings'|'env'|'default' }>}
 */
export async function resolveSchoolScheduleEnforcement(db, env) {
  try {
    if (db) {
      const row = await db
        .prepare('SELECT value FROM lantern_settings WHERE key = ?')
        .bind(ACCESS_ENFORCEMENT_SETTING_KEY)
        .first();
      if (row && row.value != null && String(row.value).trim() !== '') {
        const parsed = parseAccessEnforcementEnabled(row.value);
        if (parsed.ok) return { enabled: parsed.value, source: 'settings' };
      }
    }
  } catch (_) {
    // Missing table/row — fall through to env/default.
  }
  if (envEnforcementEnabled(env)) return { enabled: true, source: 'env' };
  return { enabled: ACCESS_ENFORCEMENT_DEFAULT, source: 'default' };
}

/** Sync env-only check — legacy callers / tests. Prefer `resolveSchoolScheduleEnforcement`. */
export function isSchoolScheduleEnforcementEnabled(env) {
  return envEnforcementEnabled(env);
}

export async function getSchoolScheduleEnforcementEnabled(db, env) {
  const resolved = await resolveSchoolScheduleEnforcement(db, env);
  return resolved.enabled;
}

export async function setSchoolScheduleEnforcementEnabled(db, enabled, updatedBy) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(ACCESS_ENFORCEMENT_SETTING_KEY, enabled ? 'true' : 'false', now, updatedBy || null)
    .run();
  return now;
}

/** Server truth bundle for admin + teacher status surfaces. */
export async function buildAccessEnforcementStatus(db, env, now) {
  const nowDate = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const schedule = evaluateSchoolSchedule(nowDate);
  const enforcement = await resolveSchoolScheduleEnforcement(db, env);
  const effectiveEnforcementActive = !!(enforcement.enabled && schedule.withinScheduledLock);
  return {
    enforcement_enabled: enforcement.enabled,
    enforcement_source: enforcement.source,
    currently_inside_lock_window: !!schedule.withinScheduledLock,
    effective_enforcement_active: effectiveEnforcementActive,
    lock_window:
      schedule.lockStart && schedule.lockEnd
        ? { start: schedule.lockStart, end: schedule.lockEnd, timezone: SCHOOL_SCHEDULE_TIMEZONE }
        : null,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    schedule,
  };
}
