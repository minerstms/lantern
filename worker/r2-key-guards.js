/**
 * Prompt #221 — route-specific R2 object key allowlists.
 * Reject path traversal and cross-namespace reads.
 */

function trimKey(raw) {
  return raw == null ? '' : String(raw).trim();
}

export function isSafeObjectKey(raw) {
  const key = trimKey(raw);
  if (!key) return false;
  if (key.length > 240) return false;
  if (key.includes('..') || key.includes('\\') || key.includes('\0')) return false;
  if (key.startsWith('/') || key.startsWith('./')) return false;
  if (key.includes('//')) return false;
  return true;
}

export function isAvatarObjectKey(raw) {
  const key = trimKey(raw);
  return isSafeObjectKey(key) && key.startsWith('avatars/') && key !== 'avatars/';
}

export function isNewsImageObjectKey(raw) {
  const key = trimKey(raw);
  if (!isSafeObjectKey(key) || !key.startsWith('news/')) return false;
  if (key.startsWith('news/video/')) return false;
  return key !== 'news/';
}

export function isNewsVideoObjectKey(raw) {
  const key = trimKey(raw);
  return isSafeObjectKey(key) && key.startsWith('news/video/') && key !== 'news/video/';
}

export function isMediaLibraryObjectKey(raw) {
  const key = trimKey(raw);
  if (!isSafeObjectKey(key)) return false;
  return (key.startsWith('default/') && key !== 'default/') || (key.startsWith('library/') && key !== 'library/');
}
