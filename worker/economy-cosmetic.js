/**
 * Server-authoritative cosmetic purchase: catalog price, ownership, wallet, and idempotency.
 */

import { getCosmeticById, isPurchasableCosmetic, serverCosmeticPrice } from './cosmetic-catalog.js';
import { awardAchievementsForCosmeticPurchase } from './locker-achievements.js';
import { fetchCosmeticOwnershipRow } from './locker-storage.js';
import { tmsEconomyTransact, tmsStaffEconomyTransact } from './tms-economy-bridge.js';
import { isStaffEconomyKey, resolveStaffTmsPrincipal } from './staff-economy.js';

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const s = String(item || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function findIdempotentCosmeticTx(db, characterName, idempotencyKey) {
  const key = String(idempotencyKey || '').trim();
  if (!key || !db) return null;
  try {
    const row = await db
      .prepare(
        "SELECT id, character_name, delta, kind, note, created_at, meta_json FROM lantern_transactions WHERE character_name = ? AND kind = 'cosmetic' AND json_extract(meta_json, '$.idempotency_key') = ? LIMIT 1"
      )
      .bind(characterName, key)
      .first();
    return row || null;
  } catch (_) {
    return null;
  }
}

/**
 * Atomic cosmetic purchase. Ignores client-supplied price; uses catalog cost.
 *
 * Prompt #96 Atomic Purchase Rule: TMS Nuggets is the one authoritative Nugget ledger, so a
 * cosmetic purchase must never grant the item before the currency has actually been deducted
 * there. Sequence for a real TMS student (options.env + options.tmsEconomyTransact provided):
 *   1. ownership check (unchanged, cheap, blocks re-purchase of an already-owned item)
 *   2. TMS spend FIRST, keyed by the idempotency key (retry-safe: TMS applies the delta at most
 *      once per key; a repeated call with the same key is a no-op, never a double charge)
 *   3. ONLY if the TMS spend succeeds (or was already applied idempotently) -> grant local
 *      ownership + write the local mirror transaction record
 * If the TMS spend fails (insufficient balance, or any other real error) the cosmetic is NEVER
 * granted. If this character_name is not a real TMS student (demo/persona/dev fixture),
 * tmsEconomyTransact resolves `notFound: true` and this falls back to the legacy Lantern-only
 * wallet path unchanged (no real currency involved either way for those accounts).
 */
export async function executeCosmeticPurchase(db, characterName, cosmeticId, options) {
  const key = String(characterName || '').trim();
  const cid = String(cosmeticId || '').trim();
  const idempotencyKey = options && options.idempotencyKey ? String(options.idempotencyKey).trim() : '';
  const env = options && options.env;
  if (!key || !cid || !db) return { ok: false, error: 'missing_fields' };
  if (!getCosmeticById(cid)) return { ok: false, error: 'unknown_cosmetic' };
  if (!isPurchasableCosmetic(cid)) return { ok: false, error: 'not_purchasable' };

  const existingTx = idempotencyKey ? await findIdempotentCosmeticTx(db, key, idempotencyKey) : null;
  if (existingTx) {
    const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(key).first();
    return {
      ok: true,
      idempotent: true,
      id: existingTx.id,
      character_name: key,
      delta: existingTx.delta,
      balance_after: walletRow ? Number(walletRow.balance) || 0 : 0,
      cosmetic_id: cid,
    };
  }

  const cost = serverCosmeticPrice(cid);
  if (cost == null || cost <= 0) return { ok: false, error: 'not_purchasable' };

  const ownership = await fetchCosmeticOwnershipRow(db, key);
  if ((ownership.owned || []).includes(cid)) {
    return { ok: false, error: 'already_owned', cosmetic_id: cid };
  }

  const item = getCosmeticById(cid);
  const now = new Date().toISOString();
  const txId = 'tx-' + crypto.randomUUID();
  const delta = -cost;
  const note = (item.name || cid) + ' purchase';

  let tmsResult = null;
  if (isStaffEconomyKey(key) && !env) {
    return { ok: false, error: 'bridge_not_configured', message: 'Nugget account needs linking' };
  }
  if (env) {
    const reference = 'lantern:store_purchase:' + (idempotencyKey || txId);
    if (isStaffEconomyKey(key)) {
      const staffPrincipal = await resolveStaffTmsPrincipal(db, key);
      if (!staffPrincipal.ok) {
        return { ok: false, error: 'tms_identity_not_linked', message: 'Nugget account needs linking' };
      }
      tmsResult = await tmsStaffEconomyTransact(env, staffPrincipal.tmsStaffId, delta, 'cosmetic', '', note, reference);
      if (tmsResult.ok) {
        // Fall through to grant.
      } else {
        const insufficient = tmsResult.code === 'insufficient_balance' || tmsResult.error === 'insufficient_balance';
        if (insufficient) {
          return { ok: false, error: 'insufficient', need: cost, available: null, cosmetic_id: cid };
        }
        return { ok: false, error: tmsResult.error || 'purchase_failed', cosmetic_id: cid };
      }
    } else {
      tmsResult = await tmsEconomyTransact(env, key, delta, 'cosmetic', '', note, reference);
      if (tmsResult.ok) {
        // Fall through to grant the item -- currency already moved on the authoritative ledger.
      } else if (!tmsResult.notFound) {
        const insufficient = tmsResult.code === 'insufficient_balance' || tmsResult.error === 'insufficient_balance';
        if (insufficient) {
          return { ok: false, error: 'insufficient', need: cost, available: null, cosmetic_id: cid };
        }
        return { ok: false, error: tmsResult.error || 'purchase_failed', cosmetic_id: cid };
      } else if (options.allowLegacyWallet === false) {
        return { ok: false, error: 'tms_student_not_found', cosmetic_id: cid };
      }
      // tmsResult.notFound === true -> demo/persona fixtures only may use lantern_wallets.
    }
  }

  let balanceAfter;
  if (tmsResult && tmsResult.ok) {
    balanceAfter = tmsResult.available;
  } else {
    const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(key).first();
    const currentBalance = walletRow ? Number(walletRow.balance) || 0 : 0;
    if (currentBalance < cost) {
      return { ok: false, error: 'insufficient', need: cost, available: currentBalance };
    }
    balanceAfter = currentBalance + delta;
  }

  const meta = {
    cosmetic_id: cid,
    item_name: item.name || cid,
    idempotency_key: idempotencyKey || null,
    server_price: cost,
    tms_backed: !!(tmsResult && tmsResult.ok),
  };
  const owned = uniqueStrings([...(ownership.owned || []), cid]);
  const equippedJson = JSON.stringify(ownership.equipped && typeof ownership.equipped === 'object' ? ownership.equipped : {});

  const walletStatements = tmsResult && tmsResult.ok
    ? []
    : [
        db
          .prepare(
            'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
          )
          .bind(key, balanceAfter, now, delta, now),
      ];

  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(txId, key, delta, 'cosmetic', '', note, now, JSON.stringify(meta)),
      ...walletStatements,
      db
        .prepare(
          'INSERT INTO lantern_cosmetic_ownership (character_name, owned_json, equipped_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET owned_json = excluded.owned_json, updated_at = excluded.updated_at'
        )
        .bind(key, JSON.stringify(owned), equippedJson, now),
    ]);
  } catch (e) {
    return { ok: false, error: 'purchase_failed', detail: String(e && e.message ? e.message : e) };
  }

  try {
    await awardAchievementsForCosmeticPurchase(db, key, txId, cid);
  } catch (_) {}

  return {
    ok: true,
    id: txId,
    character_name: key,
    delta,
    balance_after: balanceAfter,
    cosmetic_id: cid,
    server_price: cost,
    economy_authority: tmsResult && tmsResult.ok ? 'tms_nuggets' : 'lantern_legacy',
  };
}
