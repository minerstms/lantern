/** Private Locker bio validation — plain text, max 180 chars, no control characters. */

export const BIO_MAX_LENGTH = 180;

const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, bio: string|null } | { ok: false, error: string, max?: number }}
 */
export function sanitizeBioInput(raw) {
  if (raw == null) return { ok: true, bio: null };
  if (typeof raw !== 'string') return { ok: false, error: 'invalid_bio_type' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, bio: null };
  if (CONTROL_CHAR_RE.test(trimmed)) return { ok: false, error: 'invalid_bio_characters' };
  if (trimmed.length > BIO_MAX_LENGTH) {
    return { ok: false, error: 'bio_too_long', max: BIO_MAX_LENGTH };
  }
  return { ok: true, bio: trimmed };
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeBioFromDb(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}
