/**
 * Prompt #169 — apply one Nugget earn/spend to the authoritative TMS ledger.
 *
 * Staff keys (`staff:` / `staff_id:`) always use the TMS staff principal.
 * They never fall back to lantern_wallets (Locker/TMS would not show that balance).
 *
 * Students use TMS student_id. Only genuine TMS "student not found" (demo/persona)
 * may fall back to the legacy Lantern wallet.
 */
import { tmsEconomyBalance, tmsEconomyTransact, tmsStaffEconomyBalance, tmsStaffEconomyTransact } from './tms-economy-bridge.js';
import { isStaffEconomyKey, resolveStaffTmsPrincipal } from './staff-economy.js';

function finiteLedgerNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * One read of the authoritative TMS snapshot for a Lantern economy key.
 * Never invents 0 from a miss. Real TMS 0 is returned as 0.
 */
export async function fetchAuthoritativeEconomySnapshot(env, db, characterName) {
  const key = String(characterName || '').trim();
  if (!key || !env) {
    return { ok: false, error: 'missing_identity', available: null, earned: null, spent: null };
  }
  if (isStaffEconomyKey(key)) {
    if (!db) return { ok: false, error: 'db_required', available: null, earned: null, spent: null };
    const staffPrincipal = await resolveStaffTmsPrincipal(db, key);
    if (!staffPrincipal.ok) {
      return { ok: false, error: 'tms_identity_not_linked', available: null, earned: null, spent: null };
    }
    const staffBal = await tmsStaffEconomyBalance(env, staffPrincipal.tmsStaffId);
    if (!staffBal.ok) {
      return {
        ok: false,
        error: staffBal.error || 'staff_balance_unavailable',
        notFound: !!staffBal.notFound,
        available: null,
        earned: null,
        spent: null,
      };
    }
    return {
      ok: true,
      available: finiteLedgerNumber(staffBal.available),
      earned: finiteLedgerNumber(staffBal.earned),
      spent: finiteLedgerNumber(staffBal.spent),
      authority: 'tms_nuggets_staff',
      history: staffBal.recentHistory || [],
    };
  }
  const tms = await tmsEconomyBalance(env, key);
  if (!tms.ok) {
    return {
      ok: false,
      error: tms.error || 'balance_unavailable',
      notFound: !!tms.notFound,
      available: null,
      earned: null,
      spent: null,
    };
  }
  return {
    ok: true,
    available: finiteLedgerNumber(tms.available),
    earned: finiteLedgerNumber(tms.earned),
    spent: finiteLedgerNumber(tms.spent),
    authority: 'tms_nuggets',
    history: tms.recentHistory || [],
  };
}

export async function applyAuthoritativeNuggetDelta(db, env, spec) {
  spec = spec || {};
  const characterName = String(spec.characterName || '').trim();
  const delta = Math.floor(Number(spec.delta));
  const kind = String(spec.kind || 'lantern').trim() || 'lantern';
  const source = String(spec.source || 'LANTERN').trim() || 'LANTERN';
  const note = String(spec.note || '').trim();
  const reference = String(spec.reference || '').trim();
  const now = spec.now || new Date().toISOString();
  const meta = spec.meta && typeof spec.meta === 'object' ? spec.meta : {};
  const writeMirror = spec.writeMirror !== false;

  if (!characterName || !reference || !env) {
    return { ok: false, status: 'failed', error: 'missing_identity' };
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, status: 'failed', error: 'invalid_delta' };
  }

  async function mirror(extra) {
    if (!writeMirror || !db) return null;
    const txId = spec.txId || ('tx-' + crypto.randomUUID());
    try {
      await db
        .prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          txId,
          characterName,
          delta,
          kind,
          source,
          note,
          now,
          JSON.stringify(Object.assign({ tms_reference: reference }, meta, extra || {}))
        )
        .run();
    } catch (_) {}
    return txId;
  }

  if (isStaffEconomyKey(characterName)) {
    if (!db) return { ok: false, status: 'failed', error: 'db_required' };
    const staffPrincipal = await resolveStaffTmsPrincipal(db, characterName);
    if (!staffPrincipal.ok) {
      return { ok: false, status: 'needs_link', error: 'tms_identity_not_linked' };
    }
    const staffTx = await tmsStaffEconomyTransact(
      env,
      staffPrincipal.tmsStaffId,
      delta,
      kind,
      source,
      note,
      reference
    );
    if (!staffTx.ok) {
      return {
        ok: false,
        status: 'failed',
        error: staffTx.error || 'tms_staff_transact_failed',
        code: staffTx.code,
      };
    }
    await mirror({
      tms_backed: true,
      tms_staff_id: staffPrincipal.tmsStaffId,
      economy_authority: 'tms_nuggets_staff',
    });
    return {
      ok: true,
      status: staffTx.idempotent ? 'idempotent' : 'granted',
      authority: 'tms_nuggets_staff',
      available: staffTx.available,
      idempotent: !!staffTx.idempotent,
    };
  }

  const tms = await tmsEconomyTransact(env, characterName, delta, kind, source, note, reference);
  if (tms.ok) {
    await mirror({ tms_backed: true, economy_authority: 'tms_nuggets' });
    return {
      ok: true,
      status: tms.idempotent ? 'idempotent' : 'granted',
      authority: 'tms_nuggets',
      available: tms.available,
      idempotent: !!tms.idempotent,
    };
  }
  if (!tms.notFound) {
    return {
      ok: false,
      status: 'failed',
      error: tms.error || 'tms_transact_failed',
      code: tms.code,
    };
  }

  if (spec.allowLegacyWallet === false || !db) {
    return { ok: false, status: 'failed', error: 'tms_student_not_found' };
  }

  const walletRow = await db
    .prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?')
    .bind(characterName)
    .first();
  const currentBalance = walletRow ? Number(walletRow.balance) || 0 : 0;
  if (delta < 0 && currentBalance + delta < 0) {
    return {
      ok: false,
      status: 'failed',
      error: 'insufficient',
      code: 'insufficient_balance',
      available: currentBalance,
    };
  }
  await db
    .prepare(
      'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
    )
    .bind(characterName, currentBalance + delta, now, delta, now)
    .run();
  await mirror({ tms_backed: false, economy_authority: 'lantern_legacy' });
  return {
    ok: true,
    status: 'legacy',
    authority: 'lantern_legacy',
    available: currentBalance + delta,
  };
}
