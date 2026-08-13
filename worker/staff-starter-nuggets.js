/**
 * Prompt #165 — Staff Starter Nuggets bulk grant.
 * ADD-only TMS staff ledger transactions; one batch_id; per-target idempotency via TMS reference.
 * No second wallet. No balance overwrite. No D1 migration.
 */
import { fetchAdminUserRow, isStaffAccountRole } from './admin-account-utils.js';
import { resolveStaffTmsPrincipal } from './staff-economy.js';
import { tmsStaffEconomyTransact } from './tms-economy-bridge.js';
import { isKnownDemoPersonaName } from './demo-persona-guard.js';

export const STAFF_STARTER_KIND = 'staff_starter_nuggets';
export const STAFF_STARTER_SOURCE = 'staff_starter_nuggets';
export const STAFF_STARTER_DEFAULT_REASON = 'Staff starter Nuggets';
export const STAFF_STARTER_MAX_AMOUNT = 100;
export const STAFF_STARTER_MAX_TARGETS = 80;
export const STAFF_STARTER_REASON_MAX = 2000;
export const STAFF_STARTER_PRESETS = [1, 5, 10, 25];

export function isSystemWebAdminAccount(row) {
  return String((row && row.username) || '')
    .trim()
    .toLowerCase() === 'admin';
}

export function accountIsActiveRow(row) {
  if (!row) return false;
  return !(row.is_active === 0 || row.is_active === '0' || row.is_active === false);
}

export function staffStarterEconomyKey(row) {
  if (!row) return '';
  const sid = row.staff_id != null ? Number(row.staff_id) : 0;
  if (Number.isFinite(sid) && sid > 0) return 'staff_id:' + Math.floor(sid);
  const un = String(row.username || '').trim();
  return un ? 'staff:' + un : '';
}

export function staffStarterDisplayName(row) {
  if (!row) return '';
  const publicName = row.public_display_name != null ? String(row.public_display_name).trim() : '';
  if (publicName) return publicName;
  const first = row.first_name != null ? String(row.first_name).trim() : '';
  const last = row.last_name != null ? String(row.last_name).trim() : '';
  if (first && last) return (first + ' ' + last).trim();
  const dn = row.display_name != null ? String(row.display_name).trim() : '';
  return dn || String(row.username || '').trim();
}

export function isDemoOrSyntheticStaff(row) {
  if (!row) return true;
  return (
    isKnownDemoPersonaName(row.display_name) ||
    isKnownDemoPersonaName(row.public_display_name) ||
    isKnownDemoPersonaName(row.username)
  );
}

export function normalizeStaffStarterBatchId(raw) {
  const s = String(raw || '').trim();
  if (!/^staff_starter:[A-Za-z0-9_-]{8,80}$/.test(s)) return '';
  return s;
}

export function validateStaffStarterAmount(raw) {
  if (raw == null || raw === '') return { ok: false, error: 'invalid_amount' };
  if (typeof raw === 'string' && !/^\s*\d+\s*$/.test(raw)) return { ok: false, error: 'invalid_amount' };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'invalid_amount' };
  if (n <= 0) return { ok: false, error: 'invalid_amount' };
  if (n > STAFF_STARTER_MAX_AMOUNT) return { ok: false, error: 'amount_too_large', max: STAFF_STARTER_MAX_AMOUNT };
  return { ok: true, amount: n };
}

export function validateStaffStarterReason(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return { ok: false, error: 'reason_required' };
  if (value.length > STAFF_STARTER_REASON_MAX) return { ok: false, error: 'reason_too_long' };
  return { ok: true, reason: value };
}

export function staffStarterReference(batchId, economyKey) {
  return `lantern:${STAFF_STARTER_KIND}:${String(batchId || '').trim()}:${String(economyKey || '').trim()}`;
}

export function staffStarterTxId(batchId, economyKey) {
  const safe = `${String(batchId || '')}_${String(economyKey || '')}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return `tx_ssn_${safe || 'unknown'}`;
}

/**
 * Server-side eligibility without trusting the client checkbox.
 * Linkage is checked separately via resolveStaffTmsPrincipal (exact TMS id only).
 */
export function classifyStaffStarterTarget(row) {
  if (!row) return { ok: false, skip: true, error: 'not_found', label: 'Not found' };
  const username = String(row.username || '').trim();
  const displayName = staffStarterDisplayName(row);
  if (isSystemWebAdminAccount(row)) {
    return { ok: false, skip: true, error: 'system_account', username, display_name: displayName, label: 'System account' };
  }
  if (isDemoOrSyntheticStaff(row)) {
    return { ok: false, skip: true, error: 'synthetic', username, display_name: displayName, label: 'Synthetic/demo account' };
  }
  const role = String(row.role || '').trim().toLowerCase();
  if (role === 'student') {
    return { ok: false, skip: true, error: 'not_staff', username, display_name: displayName, label: 'Students excluded' };
  }
  if (!isStaffAccountRole(row.role)) {
    return { ok: false, skip: true, error: 'not_staff', username, display_name: displayName, label: 'Not staff' };
  }
  if (!accountIsActiveRow(row)) {
    return { ok: false, skip: true, error: 'inactive', username, display_name: displayName, label: 'Inactive' };
  }
  const economyKey = staffStarterEconomyKey(row);
  if (!economyKey) {
    return { ok: false, skip: true, error: 'missing_identity', username, display_name: displayName, label: 'Needs Link' };
  }
  return { ok: true, username, display_name: displayName, economyKey, role };
}

function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

async function grantOneStaffStarter(db, env, opts) {
  const {
    row,
    amount,
    reason,
    batchId,
    actorUsername,
    actorDisplay,
  } = opts;
  const classified = classifyStaffStarterTarget(row);
  if (!classified.ok) {
    return {
      username: classified.username || String((row && row.username) || '').trim(),
      display_name: classified.display_name || staffStarterDisplayName(row),
      status: 'skipped',
      reason: classified.label,
      error: classified.error,
    };
  }

  let principal = await resolveStaffTmsPrincipal(db, classified.economyKey);
  if (!principal.ok && classified.economyKey.indexOf('staff_id:') === 0) {
    const fallbackKey = 'staff:' + classified.username;
    principal = await resolveStaffTmsPrincipal(db, fallbackKey);
    if (principal.ok) classified.economyKey = fallbackKey;
  }
  if (!principal.ok) {
    return {
      username: classified.username,
      display_name: classified.display_name,
      status: 'skipped',
      reason: 'Needs Link',
      error: 'unlinked',
    };
  }

  const reference = staffStarterReference(batchId, classified.economyKey);
  const note =
    reason +
    ' — by ' +
    actorDisplay +
    (actorUsername && actorUsername !== actorDisplay ? ' (' + actorUsername + ')' : '') +
    ' [' +
    batchId +
    ']';
  const staffTx = await tmsStaffEconomyTransact(
    env,
    principal.tmsStaffId,
    amount,
    STAFF_STARTER_KIND,
    STAFF_STARTER_SOURCE,
    note,
    reference
  );
  if (!staffTx.ok) {
    return {
      username: classified.username,
      display_name: classified.display_name,
      status: 'failed',
      reason: 'upstream TMS error',
      error: staffTx.error || 'tms_staff_transact_failed',
    };
  }

  const now = new Date().toISOString();
  const txId = staffStarterTxId(batchId, classified.economyKey);
  const meta = {
    initiated_by: actorUsername,
    initiated_by_display: actorDisplay,
    context: 'admin_panel',
    source: STAFF_STARTER_SOURCE,
    batch_id: batchId,
    target_username: classified.username,
    tms_reference: reference,
    tms_backed: true,
    tms_staff_id: principal.tmsStaffId,
  };
  try {
    await db
      .prepare(
        'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        txId,
        classified.economyKey,
        amount,
        STAFF_STARTER_KIND,
        STAFF_STARTER_SOURCE,
        note,
        now,
        JSON.stringify(meta)
      )
      .run();
  } catch (_) {
    /* Deterministic id: retry of an already-mirrored grant is expected. */
  }

  return {
    username: classified.username,
    display_name: classified.display_name,
    status: staffTx.idempotent ? 'already_applied' : 'credited',
    reason: staffTx.idempotent ? 'Already credited in this batch' : 'Credited',
    tms_staff_id: principal.tmsStaffId,
    balance_after: staffTx.available,
    idempotent: !!staffTx.idempotent,
    economy_authority: 'tms_nuggets_staff',
  };
}

export async function processStaffStarterBatch(db, env, actorAccount, body) {
  const batchId = normalizeStaffStarterBatchId(body && body.batch_id);
  if (!batchId) return { ok: false, code: 400, error: 'invalid_batch_id' };

  const amountCheck = validateStaffStarterAmount(body && body.amount);
  if (!amountCheck.ok) return { ok: false, code: 400, error: amountCheck.error, max: amountCheck.max };

  const reasonCheck = validateStaffStarterReason(body && body.reason);
  if (!reasonCheck.ok) return { ok: false, code: 400, error: reasonCheck.error };

  const rawTargets = Array.isArray(body && body.usernames) ? body.usernames : [];
  const usernames = [];
  const seen = new Set();
  for (const raw of rawTargets) {
    const u = String(raw || '').trim();
    const key = u.toLowerCase();
    if (!u || seen.has(key)) continue;
    seen.add(key);
    usernames.push(u);
  }
  if (!usernames.length) return { ok: false, code: 400, error: 'no_targets' };
  if (usernames.length > STAFF_STARTER_MAX_TARGETS) {
    return { ok: false, code: 400, error: 'too_many_targets', max: STAFF_STARTER_MAX_TARGETS };
  }

  const actorUsername = String((actorAccount && actorAccount.username) || '').trim() || 'admin';
  const actorDisplay =
    String((actorAccount && actorAccount.display_name) || '').trim() || actorUsername;

  const results = [];
  for (const username of usernames) {
    const row = await fetchAdminUserRow(db, username);
    results.push(
      await grantOneStaffStarter(db, env, {
        row,
        amount: amountCheck.amount,
        reason: reasonCheck.reason,
        batchId,
        actorUsername,
        actorDisplay,
      })
    );
  }

  const creditedNew = results.filter((r) => r.status === 'credited').length;
  const already = results.filter((r) => r.status === 'already_applied').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const credited = creditedNew + already;

  return {
    ok: true,
    code: 200,
    batch_id: batchId,
    amount: amountCheck.amount,
    reason: reasonCheck.reason,
    selected: results.length,
    credited,
    credited_new: creditedNew,
    already_applied: already,
    skipped,
    failed,
    total_credited: creditedNew * amountCheck.amount,
    success: failed === 0 && skipped === 0,
    partial: failed > 0 || skipped > 0,
    economy_authority: 'tms_nuggets_staff',
    results,
  };
}

export async function handleStaffStarterNuggets(request, env, cors, actorAccount) {
  if (!actorAccount || String(actorAccount.role || '').trim().toLowerCase() !== 'admin') {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
  }
  let body;
  try {
    body = JSON.parse((await request.text()) || '{}');
  } catch (_) {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
  }
  const result = await processStaffStarterBatch(env.DB, env, actorAccount, body);
  const status = result.code || (result.ok ? 200 : 400);
  const { code, ...payload } = result;
  return jsonResponse(payload, status, cors);
}
