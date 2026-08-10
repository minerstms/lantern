/**
 * School Access audit log — Phase #33 (Teacher School Access Control Center + Event Overrides).
 *
 * A single small additive table (`lantern_access_audit_log`, migration 054) rather than a new
 * logging framework: one row per security-relevant School Access action. Writes are
 * best-effort/non-blocking (see recordAccessAuditEvent) so a logging failure can never prevent or
 * roll back the underlying action it describes, and audit rows are NEVER read as an
 * authorization signal anywhere.
 *
 * NEVER pass a credential secret (raw device token, pairing secret, access-request device
 * secret, or anything that would hash to one) into `detail` — only ids, human-entered labels,
 * durations, and reasons belong here.
 */

export const ACCESS_AUDIT_ACTIONS = Object.freeze({
  REQUEST_APPROVED: 'request_approved',
  REQUEST_DENIED: 'request_denied',
  GRANT_EXTENDED: 'grant_extended',
  GRANT_REVOKED: 'grant_revoked',
  DEVICE_ENROLLED: 'device_enrolled',
  DEVICE_REVOKED: 'device_revoked',
  GROUP_UNLOCKED: 'group_unlocked',
  GROUP_LOCKED: 'group_locked',
  OVERRIDE_STARTED: 'override_started',
  OVERRIDE_ENDED: 'override_ended',
  ENFORCEMENT_SETTING_CHANGED: 'enforcement_setting_changed',
});

/**
 * Best-effort insert into lantern_access_audit_log. Swallows all errors -- audit logging must
 * never be able to break, block, or roll back the action it is recording.
 *
 * @param {D1Database} db
 * @param {{action: string, staffId?: string|null, staffName?: string|null, targetId?: string|null, detail?: any}} params
 */
export async function recordAccessAuditEvent(db, params) {
  try {
    if (!db || !params || !params.action) return;
    const { action, staffId, staffName, targetId, detail } = params;
    const id = 'accaudit_' + crypto.randomUUID().replace(/-/g, '');
    let detailStr = null;
    if (detail != null) {
      detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
      detailStr = detailStr.slice(0, 500);
    }
    await db.prepare(
      'INSERT INTO lantern_access_audit_log (id, action, staff_id, staff_name, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, action, staffId || null, staffName || null, targetId || null, detailStr, new Date().toISOString()).run();
  } catch (_) {
    // Best-effort only -- see module header.
  }
}
