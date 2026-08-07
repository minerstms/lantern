/**
 * Server-authoritative cosmetic purchase: catalog price, ownership, wallet, and idempotency.
 */

import { getCosmeticById, isPurchasableCosmetic, serverCosmeticPrice } from './cosmetic-catalog.js';
import { awardAchievementsForCosmeticPurchase } from './locker-achievements.js';
import { fetchCosmeticOwnershipRow } from './locker-storage.js';

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
 */
export async function executeCosmeticPurchase(db, characterName, cosmeticId, options) {
  const key = String(characterName || '').trim();
  const cid = String(cosmeticId || '').trim();
  const idempotencyKey = options && options.idempotencyKey ? String(options.idempotencyKey).trim() : '';
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

  const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(key).first();
  const currentBalance = walletRow ? Number(walletRow.balance) || 0 : 0;
  if (currentBalance < cost) {
    return { ok: false, error: 'insufficient', need: cost, available: currentBalance };
  }

  const item = getCosmeticById(cid);
  const now = new Date().toISOString();
  const txId = 'tx-' + crypto.randomUUID();
  const delta = -cost;
  const meta = {
    cosmetic_id: cid,
    item_name: item.name || cid,
    idempotency_key: idempotencyKey || null,
    server_price: cost,
  };
  const note = (item.name || cid) + ' purchase';
  const owned = uniqueStrings([...(ownership.owned || []), cid]);
  const equippedJson = JSON.stringify(ownership.equipped && typeof ownership.equipped === 'object' ? ownership.equipped : {});

  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(txId, key, delta, 'cosmetic', '', note, now, JSON.stringify(meta)),
      db
        .prepare(
          'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
        )
        .bind(key, currentBalance + delta, now, delta, now),
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
    balance_after: currentBalance + delta,
    cosmetic_id: cid,
    server_price: cost,
  };
}
