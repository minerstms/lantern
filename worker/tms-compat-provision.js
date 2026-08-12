/**
 * Prompt #111 — Lantern Staff → Behavior Logger compatibility identity.
 *
 * Canonical CURRENT identity: lantern_pilot_accounts (staff_id / username / display).
 * Technical BL key: MTSS staff.teacher_id = L{staff_id} when no legacy link exists.
 * Never fuzzy-match legacy roster names/emails.
 */

import { isStaffAccountRole } from './admin-account-utils.js';
import { resolveTmsStaffIdForLanternAccount } from './staff-economy.js';

/** Deterministic MTSS compatibility teacher_id from immutable Lantern staff_id. */
export function compatibilityTeacherIdFromLanternStaffId(staffId) {
  const n = Number(staffId);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return '';
  return 'L' + Math.floor(n);
}

/** Authoritative current display label for BL session identity (not public honorific policy). */
export function canonicalLanternStaffDisplayName(account) {
  if (!account || typeof account !== 'object') return '';
  const composed = `${String(account.first_name || '').trim()} ${String(account.last_name || '').trim()}`.trim();
  const display = String(account.display_name || '').trim();
  return display || composed || String(account.username || '').trim();
}

export function previewBlCompatForLanternStaff(account) {
  const username = String((account && account.username) || '').trim();
  const staffId = account && account.staff_id != null ? Number(account.staff_id) : 0;
  const teacherId = compatibilityTeacherIdFromLanternStaffId(staffId);
  return {
    lantern_staff_id: Number.isFinite(staffId) && staffId > 0 ? Math.floor(staffId) : null,
    username,
    canonical_display: canonicalLanternStaffDisplayName(account),
    email: String((account && account.email) || '').trim(),
    proposed_teacher_id: teacherId || null,
    proposed_capability: 'TEACHER',
    is_staff_role: isStaffAccountRole(account && account.role),
  };
}

function getTmsApiBase(env) {
  // Same default as worker/index.js getTmsNuggetsApiBaseUrl.
  const raw = String((env && env.TMS_NUGGETS_API_BASE_URL) || 'https://mtss-behavior-log.mrradle.workers.dev').trim();
  return raw.replace(/\/$/, '');
}

/**
 * Server-to-server provision-or-get on MTSS staff (compatibility row + TEACHER only).
 * @param {{ dry_run?: boolean }} opts
 */
export async function callTmsCompatStaffProvision(env, payload, opts) {
  const secret = String((env && env.TMS_LANTERN_BRIDGE_SECRET) || '').trim();
  if (!secret) return { ok: false, error: 'bridge_not_configured' };
  const dryRun = !!(opts && opts.dry_run);
  const base = getTmsApiBase(env);
  let resp;
  try {
    resp = await fetch(base + '/api/lantern-bridge/staff/provision-compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...(payload || {}), dry_run: dryRun }),
    });
  } catch (_) {
    return { ok: false, error: 'bridge_request_failed' };
  }
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { ok: false, error: 'bridge_bad_response' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'bridge_bad_response' };
  if (!resp.ok || data.ok === false) {
    return { ok: false, error: (data && data.error) || 'provision_failed', _httpStatus: resp.status, ...data };
  }
  return { ...data, ok: true };
}

/**
 * Idempotent: if link exists, return it. Else provision L{staff_id} + insert tms_identity_links.
 * Does not invent links from names/emails. Does not replace existing links.
 */
export async function ensureBlCompatIdentityForLanternStaff(env, db, account, opts) {
  const createdBy = String((opts && opts.createdBy) || 'system').trim() || 'system';
  const dryRun = !!(opts && opts.dry_run);
  const username = String((account && account.username) || '').trim();
  if (!username || !db) return { ok: false, error: 'invalid_account' };
  if (!isStaffAccountRole(account.role)) {
    return { ok: false, error: 'not_staff', skipped: true };
  }
  const staffId = account.staff_id != null ? Number(account.staff_id) : 0;
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return { ok: false, error: 'missing_staff_id' };
  }
  const proposedTeacherId = compatibilityTeacherIdFromLanternStaffId(staffId);
  if (!proposedTeacherId) return { ok: false, error: 'invalid_staff_id' };

  const existingTms = await resolveTmsStaffIdForLanternAccount(db, username);
  if (existingTms) {
    return {
      ok: true,
      created: false,
      linked: true,
      tms_staff_id: existingTms,
      lantern_username: username,
      lantern_staff_id: Math.floor(staffId),
      proposed_teacher_id: proposedTeacherId,
      used_existing_link: true,
      dry_run: dryRun,
    };
  }

  const displayName = canonicalLanternStaffDisplayName(account);
  const email = String((account && account.email) || '').trim();
  const isActive = account.is_active != null ? Number(account.is_active) !== 0 : true;

  const provisioned = await callTmsCompatStaffProvision(
    env,
    {
      lantern_staff_id: Math.floor(staffId),
      lantern_username: username,
      display_name: displayName,
      teacher_email: email,
      is_active: isActive ? 1 : 0,
    },
    { dry_run: dryRun }
  );
  if (!provisioned.ok) {
    return {
      ok: false,
      error: provisioned.error || 'provision_failed',
      proposed_teacher_id: proposedTeacherId,
      provision: provisioned,
    };
  }

  const tmsStaffId = String(provisioned.tms_staff_id || proposedTeacherId).trim();
  if (!tmsStaffId) {
    return { ok: false, error: 'provision_missing_teacher_id', proposed_teacher_id: proposedTeacherId };
  }

  if (dryRun) {
    return {
      ok: true,
      created: false,
      linked: false,
      dry_run: true,
      would_provision: !!provisioned.would_create || !!provisioned.created,
      would_link: true,
      tms_staff_id: tmsStaffId,
      lantern_username: username,
      lantern_staff_id: Math.floor(staffId),
      proposed_teacher_id: proposedTeacherId,
      mtss_staff_exists: !!provisioned.exists,
      capability: 'TEACHER',
    };
  }

  // New compatibility teacher_id → this Lantern account is primary for that id.
  try {
    const existingCountRow = await db
      .prepare(`SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id = ?`)
      .bind(tmsStaffId)
      .first();
    const existingCount = existingCountRow ? Number(existingCountRow.n) || 0 : 0;
    const isPrimary = existingCount === 0 ? 1 : 0;
    if (isPrimary === 1 && existingCount > 0) {
      await db.prepare(`UPDATE tms_identity_links SET is_primary = 0 WHERE tms_staff_id = ?`).bind(tmsStaffId).run();
    }
    await db
      .prepare(
        `INSERT INTO tms_identity_links (tms_staff_id, lantern_username, lantern_staff_id, is_primary, created_at, created_by)
         VALUES (?, ?, ?, ?, datetime('now'), ?)`
      )
      .bind(tmsStaffId, username, Math.floor(staffId), isPrimary, createdBy)
      .run();
  } catch (e) {
    const msg = e && e.message ? String(e.message) : '';
    if (/UNIQUE constraint failed/i.test(msg)) {
      const again = await resolveTmsStaffIdForLanternAccount(db, username);
      if (again) {
        return {
          ok: true,
          created: !!provisioned.created,
          linked: true,
          tms_staff_id: again,
          lantern_username: username,
          lantern_staff_id: Math.floor(staffId),
          proposed_teacher_id: proposedTeacherId,
          raced: true,
        };
      }
      return { ok: false, error: 'link_already_exists', proposed_teacher_id: proposedTeacherId };
    }
    throw e;
  }

  return {
    ok: true,
    created: !!provisioned.created,
    linked: true,
    tms_staff_id: tmsStaffId,
    lantern_username: username,
    lantern_staff_id: Math.floor(staffId),
    proposed_teacher_id: proposedTeacherId,
    capability: 'TEACHER',
  };
}
