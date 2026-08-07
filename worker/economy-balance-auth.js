/**
 * Resolve which economy character_name may be read for GET /api/economy/balance.
 * Self wallet (no query param) always derives from authenticated session.
 */

export function pilotSelfEconomyKey(account, pilotEconomyCharacterName) {
  if (!account) return '';
  const role = String(account.role || '').trim().toLowerCase();
  if (role === 'student') {
    return pilotEconomyCharacterName(account) || '';
  }
  if (role === 'teacher' || role === 'admin') {
    return String(account.teacher_id || account.username || '').trim();
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
    return { ok: true, characterName, session_scoped: true };
  }
  if (role === 'teacher' || role === 'admin') {
    return { ok: true, characterName: requested, session_scoped: false };
  }
  if (role === 'student') {
    const allowed = pilotEconomyCharacterName(account) || '';
    if (allowed && requested === allowed) {
      return { ok: true, characterName: requested, session_scoped: false };
    }
    return { ok: false, code: 403, error: 'forbidden' };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}

/**
 * Resolve economy character for student self game_play charges.
 * Session-derived; ignores client-supplied display names.
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
    return { ok: true, characterName, session_scoped: true };
  }
  if (role === 'teacher' || role === 'admin') {
    const requested = String(requestedCharacterName || '').trim();
    if (!requested) {
      return { ok: false, code: 400, error: 'Missing character_name' };
    }
    return { ok: true, characterName: requested, session_scoped: false };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}
