/**
 * Prompt #252A — opaque peer-Locker routing key.
 *
 * Existing approved-feed identity (authorAvatarKey / authorId) is the durable
 * account key: mtss_student_id || student_character_name || username.
 * That key must NOT appear in peer Locker URLs.
 *
 * This module derives a stable SHA-256 token from the existing durable key.
 * It is not a second identity system — only a non-sensitive routing alias.
 */

import { durableAccountKeyFromPilotAccount } from './durable-account-key.js';

const PREFIX = 'lantern-locker-v1:';
const KEY_LEN = 32;

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

async function sha256Hex(text) {
  if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return bytesToHex(new Uint8Array(buf));
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function lockerPublicKeyFromDurableKey(durableKey) {
  const raw = trimStr(durableKey);
  if (!raw) return '';
  const hex = await sha256Hex(PREFIX + raw);
  return hex.slice(0, KEY_LEN);
}

export function normalizeLockerPublicKey(raw) {
  const s = trimStr(raw).toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(s)) return '';
  return s;
}

function isActiveAccount(row) {
  if (!row) return false;
  if (row.is_active === 0 || row.is_active === '0' || row.is_active === false) return false;
  return true;
}

function isStudentRole(row) {
  return trimStr(row && row.role).toLowerCase() === 'student';
}

/**
 * Index student accounts for attaching lockerPublicKey on approved feed items
 * and resolving GET /api/locker/showcase/:publicKey.
 */
export async function buildLockerPublicKeyIndex(db) {
  const byDurable = Object.create(null);
  const byPublic = Object.create(null);
  const byUsername = Object.create(null);
  if (!db) return { byDurable, byPublic, byUsername };
  let rows = [];
  try {
    const res = await db
      .prepare(
        'SELECT username, display_name, role, student_character_name, mtss_student_id, is_active FROM lantern_pilot_accounts WHERE lower(trim(role)) = ?'
      )
      .bind('student')
      .all();
    rows = (res && res.results) || [];
  } catch (_) {
    return { byDurable, byPublic, byUsername };
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isStudentRole(row) || !isActiveAccount(row)) continue;
    const durable = durableAccountKeyFromPilotAccount(row);
    if (!durable) continue;
    const pub = await lockerPublicKeyFromDurableKey(durable);
    if (!pub) continue;
    const entry = { account: row, durable, publicKey: pub };
    byDurable[durable.toLowerCase()] = entry;
    const scn = trimStr(row.student_character_name);
    const user = trimStr(row.username);
    const mtss = trimStr(row.mtss_student_id);
    if (scn) byDurable[scn.toLowerCase()] = entry;
    if (user) {
      byDurable[user.toLowerCase()] = entry;
      byUsername[user.toLowerCase()] = entry;
    }
    if (mtss) byDurable[mtss.toLowerCase()] = entry;
    byPublic[pub] = entry;
  }
  return { byDurable, byPublic, byUsername };
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

export async function resolveLockerPublicKey(db, publicKey) {
  const key = normalizeLockerPublicKey(publicKey);
  if (!key || !db) return null;
  const index = await buildLockerPublicKeyIndex(db);
  const hit = index.byPublic[key];
  if (!hit || !hit.account) return null;
  return hit;
}

export const lockerPublicKeyTest = {
  PREFIX,
  KEY_LEN,
  isActiveAccount,
  isStudentRole,
};
