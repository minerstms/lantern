/**
 * Prompt #252A1 — server-generated random peer-Locker public key.
 *
 * The key is cryptographically random (128 bits) and persisted once.
 * It is never derived from student id, username, character_name, email,
 * avatar key, or any other identity value.
 */

import { durableAccountKeyFromPilotAccount } from './durable-account-key.js';

const KEY_HEX_LEN = 32;
const KEY_BYTES = 16;
const INSERT_RETRIES = 6;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function generateLockerPublicKey() {
  if (globalThis.crypto && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(KEY_BYTES);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') {
    return String(crypto.randomUUID()).replace(/-/g, '').toLowerCase().slice(0, KEY_HEX_LEN);
  }
  throw new Error('secure_random_unavailable');
}

export function normalizeLockerPublicKey(raw) {
  const s = trimStr(raw).toLowerCase().replace(/-/g, '');
  if (!/^[a-f0-9]{32}$/.test(s)) return '';
  return s;
}

function isPublicKeySchemaError(err) {
  const m = String((err && err.message) || err || '');
  return /no such table:\s*lantern_locker_public_keys/i.test(m);
}

function isUniqueConstraint(err, column) {
  const m = String((err && err.message) || err || '');
  if (!/UNIQUE constraint failed/i.test(m)) return false;
  if (!column) return true;
  return m.toLowerCase().indexOf(String(column).toLowerCase()) >= 0;
}

function isActiveAccount(row) {
  if (!row) return false;
  if (row.is_active === 0 || row.is_active === '0' || row.is_active === false) return false;
  return true;
}

function isStudentRole(row) {
  return trimStr(row && row.role).toLowerCase() === 'student';
}

export async function readLockerPublicKey(db, ownerKey) {
  const key = trimStr(ownerKey);
  if (!key || !db) return '';
  try {
    const row = await db
      .prepare('SELECT public_key FROM lantern_locker_public_keys WHERE character_name = ?')
      .bind(key)
      .first();
    return normalizeLockerPublicKey(row && row.public_key);
  } catch (err) {
    if (isPublicKeySchemaError(err)) return '';
    throw err;
  }
}

export async function lookupLockerPublicKeyRow(db, publicKey) {
  const key = normalizeLockerPublicKey(publicKey);
  if (!key || !db) return null;
  try {
    const row = await db
      .prepare('SELECT character_name, public_key, created_at FROM lantern_locker_public_keys WHERE public_key = ?')
      .bind(key)
      .first();
    if (!row || !trimStr(row.character_name) || !normalizeLockerPublicKey(row.public_key)) return null;
    return {
      character_name: String(row.character_name).trim(),
      public_key: normalizeLockerPublicKey(row.public_key),
      created_at: row.created_at || null,
    };
  } catch (err) {
    if (isPublicKeySchemaError(err)) return null;
    throw err;
  }
}

/**
 * Persist one random public key for this owner. Safe on owner bootstrap paths.
 * Never accepts a client-selected key. Does not rotate on name/avatar change.
 */
export async function getOrCreateLockerPublicKey(db, ownerKey) {
  const key = trimStr(ownerKey);
  if (!key || !db) return '';
  const existing = await readLockerPublicKey(db, key);
  if (existing) return existing;
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < INSERT_RETRIES; attempt++) {
    let publicKey;
    try {
      publicKey = generateLockerPublicKey();
    } catch (_) {
      return '';
    }
    if (!normalizeLockerPublicKey(publicKey)) continue;
    try {
      await db
        .prepare(
          'INSERT INTO lantern_locker_public_keys (character_name, public_key, created_at) VALUES (?, ?, ?)'
        )
        .bind(key, publicKey, now)
        .run();
      return publicKey;
    } catch (err) {
      if (isPublicKeySchemaError(err)) return '';
      if (isUniqueConstraint(err, 'character_name')) {
        return readLockerPublicKey(db, key);
      }
      if (isUniqueConstraint(err, 'public_key')) continue;
      throw err;
    }
  }
  return '';
}

async function loadStudentAccountForOwnerKey(db, ownerKey) {
  const key = trimStr(ownerKey);
  if (!key || !db) return null;
  let rows = [];
  try {
    const res = await db
      .prepare(
        `SELECT username, display_name, role, student_character_name, mtss_student_id, is_active
         FROM lantern_pilot_accounts
         WHERE lower(trim(role)) = 'student'
           AND (
             lower(trim(username)) = lower(trim(?))
             OR lower(trim(COALESCE(student_character_name, ''))) = lower(trim(?))
             OR lower(trim(COALESCE(mtss_student_id, ''))) = lower(trim(?))
           )`
      )
      .bind(key, key, key)
      .all();
    rows = (res && res.results) || [];
  } catch (_) {
    return null;
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isStudentRole(row) || !isActiveAccount(row)) continue;
    const durable = durableAccountKeyFromPilotAccount(row);
    const aliases = [durable, row.username, row.student_character_name, row.mtss_student_id].map((v) =>
      trimStr(v).toLowerCase()
    );
    if (aliases.indexOf(key.toLowerCase()) >= 0) {
      return { account: row, durable: durable || key };
    }
  }
  return null;
}

/**
 * Read-only index of *persisted* random keys. Never hashes identity.
 * Used to attach Explore locker links only when a real key already exists.
 */
export async function buildLockerPublicKeyIndex(db) {
  const byDurable = Object.create(null);
  const byPublic = Object.create(null);
  if (!db) return { byDurable, byPublic };
  let keyRows = [];
  try {
    const res = await db.prepare('SELECT character_name, public_key FROM lantern_locker_public_keys').all();
    keyRows = (res && res.results) || [];
  } catch (err) {
    if (isPublicKeySchemaError(err)) return { byDurable, byPublic };
    throw err;
  }
  for (let i = 0; i < keyRows.length; i++) {
    const ownerKey = trimStr(keyRows[i].character_name);
    const pub = normalizeLockerPublicKey(keyRows[i].public_key);
    if (!ownerKey || !pub) continue;
    const loaded = await loadStudentAccountForOwnerKey(db, ownerKey);
    const account = loaded && loaded.account;
    const durable = (loaded && loaded.durable) || ownerKey;
    const entry = { account: account || null, durable, publicKey: pub };
    byPublic[pub] = entry;
    byDurable[ownerKey.toLowerCase()] = entry;
    byDurable[durable.toLowerCase()] = entry;
    if (account) {
      ['username', 'student_character_name', 'mtss_student_id'].forEach((field) => {
        const alias = trimStr(account[field]).toLowerCase();
        if (alias) byDurable[alias] = entry;
      });
    }
  }
  return { byDurable, byPublic };
}

export function lockerPublicKeyForAuthor(index, fields) {
  const idx = index || { byDurable: {} };
  const candidates = [
    fields && fields.authorAvatarKey,
    fields && fields.author_avatar_key,
    fields && fields.authorId,
    fields && fields.author_id,
    fields && fields.actor_id,
    fields && fields.character_name,
  ];
  for (let i = 0; i < candidates.length; i++) {
    const k = trimStr(candidates[i]).toLowerCase();
    if (!k) continue;
    const hit = idx.byDurable[k];
    if (hit && hit.publicKey) return hit.publicKey;
  }
  return '';
}

export function attachLockerPublicKeys(items, index) {
  const list = Array.isArray(items) ? items : [];
  list.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const role = trimStr(it.authorRole || it.author_role || it.author_type).toLowerCase();
    if (role && role !== 'student') return;
    const key = lockerPublicKeyForAuthor(index, it);
    if (key) it.lockerPublicKey = key;
  });
  return list;
}

/** Pure lookup. Never creates or rotates a key. Unknown key → null (404). */
export async function resolveLockerPublicKey(db, publicKey) {
  const row = await lookupLockerPublicKeyRow(db, publicKey);
  if (!row) return null;
  const loaded = await loadStudentAccountForOwnerKey(db, row.character_name);
  if (!loaded || !loaded.account) return null;
  return {
    account: loaded.account,
    durable: loaded.durable || row.character_name,
    publicKey: row.public_key,
  };
}

export const lockerPublicKeyTest = {
  KEY_HEX_LEN,
  KEY_BYTES,
  isActiveAccount,
  isStudentRole,
  isPublicKeySchemaError,
};
