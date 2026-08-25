/**
 * Canonical Lantern school-access decision (#262).
 *
 * ONE function (`evaluateCentralSchoolAccess`) gates every protected student API and mirrors
 * GET /api/class-access/state. Precedence (locked):
 *   1. staff / teacher / admin
 *   2. active schoolwide override
 *   3. active class access (enrolled device + unlocked group)
 *   4. active individual access grant
 *   5. enforcement OFF
 *   6. outside school lock window
 *   7. otherwise LOCKED
 */

import { evaluateSchoolSchedule } from './school-schedule.js';
import { getSchoolScheduleEnforcementEnabled } from './school-access-enforcement.js';
import { hashOpaqueSecret, ACCESS_DEVICE_COOKIE_NAME, derivedRequestStatus } from './access-requests.js';
import { DEVICE_TOKEN_HEADER, isDeviceActive, isGroupUnlockActive } from './device-enrollment.js';
import { isStaffSideParticipantRole } from './missions-auth.js';
import {
  evaluateRestrictedModeForAccount,
  publicRestrictedModeView,
  resolveRestrictedModeState,
} from './restricted-mode.js';

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader || !name) return '';
  const parts = cookieHeader.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) return decodeURIComponent(p.slice(name.length + 1));
  }
  return '';
}

export const SCHOOL_ACCESS_EXEMPT_PATH_PREFIXES = [
  '/api/health',
  '/api/auth',
  '/api/pilot',
  '/api/admin',
  '/api/setup',
  '/api/verify',
  '/api/class-access',
  '/api/settings',
  '/api/integrations',
  '/api/tms-nuggets',
];

export function isSchoolAccessExemptPath(path) {
  return SCHOOL_ACCESS_EXEMPT_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

export async function computeQualifyingAccessSignals(request, env, db) {
  let individualGrant = { qualifyingAccess: false, reason: 'no_device_cookie', expiresAt: null };
  try {
    const deviceSecretForGrant = getCookieValue(request.headers.get('Cookie') || '', ACCESS_DEVICE_COOKIE_NAME);
    if (deviceSecretForGrant) {
      const deviceHashForGrant = await hashOpaqueSecret(deviceSecretForGrant);
      const grantRow = await db
        .prepare(
          'SELECT status, grant_expires_at, revoked_at FROM lantern_access_requests WHERE device_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
        )
        .bind(deviceHashForGrant)
        .first();
      const nowIsoForGrant = new Date().toISOString();
      if (!grantRow) {
        individualGrant = { qualifyingAccess: false, reason: 'no_matching_request', expiresAt: null };
      } else {
        const derived = derivedRequestStatus(grantRow, nowIsoForGrant);
        individualGrant = {
          qualifyingAccess: derived === 'approved',
          reason: derived === 'approved' ? 'active_individual_grant' : derived,
          expiresAt: derived === 'approved' ? grantRow.grant_expires_at : null,
        };
      }
    }
  } catch (_) {
    individualGrant = { qualifyingAccess: false, reason: 'lookup_error', expiresAt: null };
  }

  let deviceGroupAccess = { qualifyingAccess: false, reason: 'no_device_token', groupId: null, groupName: null, expiresAt: null };
  try {
    const deviceToken = request.headers.get(DEVICE_TOKEN_HEADER) || '';
    if (deviceToken) {
      const deviceHash = await hashOpaqueSecret(deviceToken);
      const deviceRow = await db
        .prepare('SELECT id, group_id, revoked_at FROM lantern_access_devices WHERE device_token_hash = ?')
        .bind(deviceHash)
        .first();
      const nowIsoForDevice = new Date().toISOString();
      if (!deviceRow) {
        deviceGroupAccess = { qualifyingAccess: false, reason: 'unknown_device', groupId: null, groupName: null, expiresAt: null };
      } else if (!isDeviceActive(deviceRow)) {
        deviceGroupAccess = { qualifyingAccess: false, reason: 'device_revoked', groupId: null, groupName: null, expiresAt: null };
      } else if (!deviceRow.group_id) {
        deviceGroupAccess = { qualifyingAccess: false, reason: 'device_ungrouped', groupId: null, groupName: null, expiresAt: null };
      } else {
        const groupRow = await db.prepare('SELECT id, name FROM lantern_access_device_groups WHERE id = ?').bind(deviceRow.group_id).first();
        const unlockRow = await db
          .prepare(
            'SELECT expires_at, is_active, revoked_at FROM lantern_access_group_unlocks WHERE group_id = ? ORDER BY created_at DESC LIMIT 1'
          )
          .bind(deviceRow.group_id)
          .first();
        const active = isGroupUnlockActive(unlockRow, nowIsoForDevice);
        deviceGroupAccess = {
          qualifyingAccess: active,
          reason: active ? 'active_group_unlock' : 'group_not_unlocked',
          groupId: deviceRow.group_id,
          groupName: (groupRow && groupRow.name) || null,
          expiresAt: active ? unlockRow.expires_at : null,
        };
        const ipForDevice = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
        const ipHashForDevice = ipForDevice ? await hashOpaqueSecret(ipForDevice) : null;
        await db
          .prepare(
            'UPDATE lantern_access_devices SET last_seen_at = ?, last_seen_ip_hash = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)'
          )
          .bind(nowIsoForDevice, ipHashForDevice, deviceRow.id, new Date(Date.now() - 60000).toISOString())
          .run();
      }
    }
  } catch (_) {
    deviceGroupAccess = { qualifyingAccess: false, reason: 'lookup_error', groupId: null, groupName: null, expiresAt: null };
  }

  let eventOverride = { qualifyingAccess: false, reason: 'no_active_override', expiresAt: null };
  try {
    const overrideRow = await db
      .prepare('SELECT expires_at, is_active, revoked_at FROM lantern_access_overrides ORDER BY created_at DESC LIMIT 1')
      .first();
    const nowIsoForOverride = new Date().toISOString();
    const active = isGroupUnlockActive(overrideRow, nowIsoForOverride);
    eventOverride = {
      qualifyingAccess: active,
      reason: active ? 'active_event_override' : 'no_active_override',
      expiresAt: active ? overrideRow.expires_at : null,
    };
  } catch (_) {
    eventOverride = { qualifyingAccess: false, reason: 'lookup_error', expiresAt: null };
  }

  const qualifyingAccess = !!(
    individualGrant.qualifyingAccess ||
    deviceGroupAccess.qualifyingAccess ||
    eventOverride.qualifyingAccess
  );
  return { individualGrant, deviceGroupAccess, eventOverride, qualifyingAccess };
}

function decisionResult(allowed, reason, schedule, enforcementEnabled, extra) {
  const effectiveEnforcementActive = !!(enforcementEnabled && schedule.withinScheduledLock);
  return Object.assign(
    {
      allowed,
      reason,
      schedule,
      enforcementEnabled,
      effectiveEnforcementActive,
      currentlyInsideLockWindow: !!schedule.withinScheduledLock,
    },
    extra || {}
  );
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {{ getPilotAccountFromRequest?: Function }} deps
 * @param {Date|number} [now]
 */
export async function evaluateCentralSchoolAccess(request, env, deps, now) {
  const db = env && env.DB;
  const nowDate = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const schedule = evaluateSchoolSchedule(nowDate);
  const enforcementEnabled = await getSchoolScheduleEnforcementEnabled(db, env);
  const getAccount = deps && deps.getPilotAccountFromRequest;

  let account = null;
  if (getAccount) {
    try {
      account = await getAccount(request, env);
    } catch (_) {
      account = null;
    }
  }

  // Restricted Mode (#262C) — after valid identity, before any school-access rule.
  const restrictedState = await resolveRestrictedModeState(db);
  const restrictedDecision = evaluateRestrictedModeForAccount(account, restrictedState);
  const restrictedMode = publicRestrictedModeView(restrictedDecision);
  if (restrictedState.enabled && account) {
    if (restrictedDecision.allowed) {
      return decisionResult(true, restrictedDecision.reason, schedule, enforcementEnabled, { restrictedMode });
    }
    return decisionResult(false, 'restricted_mode_locked', schedule, enforcementEnabled, { restrictedMode });
  }

  // 1. Staff always allowed (only when Restricted Mode is OFF).
  if (account && isStaffSideParticipantRole(account.role)) {
    return decisionResult(true, 'staff', schedule, enforcementEnabled, { restrictedMode });
  }

  let signals = null;
  if (db) {
    signals = await computeQualifyingAccessSignals(request, env, db);
  }

  // 2. Schoolwide override.
  if (signals && signals.eventOverride.qualifyingAccess) {
    return decisionResult(true, 'event_override', schedule, enforcementEnabled, { signals, restrictedMode });
  }
  // 3. Class access — enrolled device in unlocked group.
  if (signals && signals.deviceGroupAccess.qualifyingAccess) {
    return decisionResult(true, 'device_group_unlock', schedule, enforcementEnabled, { signals, restrictedMode });
  }
  // 4. Individual access grant.
  if (signals && signals.individualGrant.qualifyingAccess) {
    return decisionResult(true, 'individual_grant', schedule, enforcementEnabled, { signals, restrictedMode });
  }
  // 5. Enforcement OFF.
  if (!enforcementEnabled) {
    return decisionResult(true, 'enforcement_disabled', schedule, enforcementEnabled, { signals, restrictedMode });
  }
  // 6. Outside lock window.
  if (!schedule.withinScheduledLock) {
    return decisionResult(true, 'outside_scheduled_lock', schedule, enforcementEnabled, { signals, restrictedMode });
  }
  // 7. Locked during active enforcement window.
  if (!db) {
    return decisionResult(false, 'db_unavailable', schedule, enforcementEnabled, { signals, restrictedMode });
  }
  return decisionResult(false, 'school_lock_active', schedule, enforcementEnabled, { signals, restrictedMode });
}
