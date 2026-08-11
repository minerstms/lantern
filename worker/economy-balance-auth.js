/**
 * Resolve which economy character_name may be read for GET /api/economy/balance.
 * Self wallet (no query param) always derives from authenticated session.
 * Prompt #107/#176: prefer durable staff_id:<id>; fall back to staff:<username>.
 */

export function staffEconomyKey(account) {
  if (!account) return '';
  const sid = account.staff_id != null ? Number(account.staff_id) : 0;
  if (Number.isFinite(sid) && sid > 0) return 'staff_id:' + Math.floor(sid);
  const u = account.username != null ? String(account.username).trim() : '';
  return u ? ('staff:' + u) : '';
}

export function pilotSelfEconomyKey(account, pilotEconomyCharacterName) {
  if (!account) return '';
  const role = String(account.role || '').trim().toLowerCase();
  if (role === 'student') {
    return pilotEconomyCharacterName(account) || '';
  }
  if (role === 'teacher' || role === 'admin') {
    return staffEconomyKey(account);
  }
  return '';
}

export function resolveEconomyBalanceRead(account, requestedCharacterName, pilotEconomyCharacterName) {
  const requested = String(requestedCharacterName || '').trim();
  if (!account) {
    return { ok: false, code: 401, error: 'not_authenticated' };
  }
  const role = String(account.role || '').trim().toLowerCase();
  if (!requested) {
    const characterName = pilotSelfEconomyKey(account, pilotEconomyCharacterName);
    if (!characterName) {
      return { ok: false, code: 400, error: 'account_link_missing' };
    }
    return {
      ok: true,
      characterName,
      session_scoped: true,
      principalKind: role === 'student' ? 'student' : 'staff',
    };
  }
  if (role === 'teacher' || role === 'admin') {
    return { ok: true, characterName: requested, session_scoped: false, principalKind: 'lookup' };
  }
  if (role === 'student') {
    const allowed = pilotEconomyCharacterName(account) || '';
    if (allowed && requested === allowed) {
      return { ok: true, characterName: requested, session_scoped: false, principalKind: 'student' };
    }
    return { ok: false, code: 403, error: 'forbidden' };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}

/**
 * Resolve economy character for game_play charges.
 * Session-derived for students and staff; ignores client-supplied display names for self-spend.
 */
export function resolveEconomyGamePlayTransact(account, requestedCharacterName, pilotEconomyCharacterName) {
  if (!account) {
    return { ok: false, code: 401, error: 'not_authenticated' };
  }
  const role = String(account.role || '').trim().toLowerCase();
  if (role === 'student') {
    const characterName = pilotSelfEconomyKey(account, pilotEconomyCharacterName);
    if (!characterName) {
      return { ok: false, code: 400, error: 'account_link_missing' };
    }
    return { ok: true, characterName, session_scoped: true, principalKind: 'student' };
  }
  if (role === 'teacher' || role === 'admin') {
    // Prompt #107 — staff pay from their own staff wallet, never a client-supplied student name.
    const characterName = staffEconomyKey(account);
    if (!characterName) {
      return { ok: false, code: 400, error: 'account_link_missing' };
    }
    return { ok: true, characterName, session_scoped: true, principalKind: 'staff' };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}
