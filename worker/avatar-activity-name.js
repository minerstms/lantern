/**
 * Shared Avatar Activity display-name formatter.
 * Student-facing label is First Name + Last Initial + period (e.g. Lucas R.).
 * Used by Avatar Match and the upcoming Avatar Quiz Mission. Do not leak surnames.
 */

const HONORIFIC_RE = /^(Mr\.|Miss|Ms\.|Mrs\.|SRO|Dr\.|Coach)\s+/i;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function firstToken(name) {
  const cleaned = trimStr(name).replace(HONORIFIC_RE, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.split(' ')[0] || '';
}

function restTokens(name) {
  const cleaned = trimStr(name).replace(HONORIFIC_RE, '').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  return parts.slice(1).join(' ');
}

function normalizeGivenName(raw) {
  const token = firstToken(raw);
  if (!token) return '';
  const letters = token.replace(/[^A-Za-z'’-]/g, '');
  if (!letters) return token;
  return letters.charAt(0).toUpperCase() + letters.slice(1);
}

function lastInitialFromSurname(raw) {
  const last = trimStr(raw);
  if (!last) return '';
  const compact = last.replace(/^['’`]+/, '');
  const ch = compact.charAt(0);
  if (!ch || !/[A-Za-z]/.test(ch)) return '';
  return ch.toUpperCase();
}

/**
 * @param {{ first_name?: string, last_name?: string, display_name?: string, student_name?: string }} row
 * @returns {string} "Lucas R." or first name only when no last name exists
 */
export function formatAvatarActivityDisplayName(row) {
  if (!row) return '';
  let first = trimStr(row.first_name);
  let last = trimStr(row.last_name);
  if (!first && !last) {
    const full = trimStr(row.student_name || row.display_name || '');
    first = firstToken(full);
    last = restTokens(full);
  }
  const given = normalizeGivenName(first);
  if (!given) return '';
  const initial = lastInitialFromSurname(last);
  if (!initial) return given;
  return given + ' ' + initial + '.';
}

export function avatarActivityNameKey(label) {
  return trimStr(label).toLowerCase();
}
