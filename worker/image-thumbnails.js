/**
 * Prompt #249B — stored thumbnail sidecar + source mapping.
 * Metadata is authoritative. Never invent a thumbnail URL from id + version.
 * Does not delete originals or old versioned thumb objects.
 */
import {
  accountOwnsFeedItem,
  accountOwnsMissionSubmission,
  accountOwnsNewsRow,
  accountOwnsPollRow,
} from './content-author-remove.js';
import { isTeacherLike } from './missions-auth.js';
import { contentReferencesObjectKey } from './news-media-delivery.js';
import { isSafeObjectKey } from './r2-key-guards.js';

export const THUMBNAIL_JPEG_MIME = 'image/jpeg';
export const THUMBNAIL_MAX_LONG_EDGE = 480;
export const THUMBNAIL_JPEG_QUALITY = 0.72;
export const THUMBNAIL_UPLOAD_MAX_BYTES = 512 * 1024;
export const THUMBNAIL_MAX_DIMENSION = 4096;

export const SOURCE_KINDS = Object.freeze([
  'news',
  'feed',
  'recognition',
  'mission_submission',
  'poll',
  'poll_contribution',
  'trivia',
]);

const SOURCE_KIND_SET = new Set(SOURCE_KINDS);

export function normalizeSourceKind(raw) {
  const k = raw == null ? '' : String(raw).trim().toLowerCase();
  if (k === 'shoutout' || k === 'shout_out' || k === 'shout-out') return 'recognition';
  return k;
}

export function isSupportedSourceKind(raw) {
  return SOURCE_KIND_SET.has(normalizeSourceKind(raw));
}

export function normalizeSourceId(raw) {
  const id = raw == null ? '' : String(raw).trim();
  if (!id || id.length > 160) return '';
  if (/[\\/\x00]/.test(id) || id.includes('..')) return '';
  return id;
}

export function getImageVersion(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function isNewsThumbObjectKey(raw) {
  const key = raw == null ? '' : String(raw).trim();
  return isSafeObjectKey(key) && key.startsWith('news/thumbs/') && key !== 'news/thumbs/';
}

function safeKeyPart(raw, max) {
  return String(raw || '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, max || 80);
}

export function buildThumbnailObjectKey(sourceKind, sourceId, imageVersion) {
  const kind = normalizeSourceKind(sourceKind);
  const id = normalizeSourceId(sourceId);
  if (!isSupportedSourceKind(kind) || !id) return '';
  return 'news/thumbs/' + safeKeyPart(kind, 40) + '-' + safeKeyPart(id, 80) + '-v' + getImageVersion(imageVersion) + '.jpg';
}

export function hasStoredThumbnail(row) {
  return !!(row && String(row.thumbnail_object_key || '').trim());
}

export function buildThumbnailDeliveryUrl(origin, sourceKind, sourceId) {
  const kind = normalizeSourceKind(sourceKind);
  const id = normalizeSourceId(sourceId);
  if (!isSupportedSourceKind(kind) || !id) return '';
  const base = String(origin || '').replace(/\/$/, '');
  return (
    base +
    '/api/news/thumb?source_kind=' +
    encodeURIComponent(kind) +
    '&source_id=' +
    encodeURIComponent(id)
  );
}

export function mapStoredThumbnailUrl(origin, sidecar) {
  if (!hasStoredThumbnail(sidecar)) return null;
  return buildThumbnailDeliveryUrl(origin, sidecar.source_kind, sidecar.source_id);
}

export function extractNewsObjectKeyFromUrl(raw) {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return '';
  const q = s.match(/[?&]key=([^&]+)/i);
  if (q) {
    try {
      return decodeURIComponent(q[1].replace(/\+/g, '%20')).trim();
    } catch (_) {
      return String(q[1] || '').trim();
    }
  }
  if (/^(news|missions|recognition)\//.test(s)) return s;
  return '';
}

export function isStudentOriginalObjectKey(key) {
  const k = key == null ? '' : String(key).trim();
  if (!k || k.startsWith('news/thumbs/')) return false;
  if (k.startsWith('missions/card/')) return false;
  if (k.startsWith('library/') || k.startsWith('default/')) return false;
  return (
    (k.startsWith('news/') && k !== 'news/') ||
    (k.startsWith('missions/') && k !== 'missions/') ||
    (k.startsWith('recognition/') && k !== 'recognition/')
  );
}

export function feedItemThumbnailRef(item) {
  if (!item) return null;
  const rawId = String(item.id || '').trim();
  const source = String(item.source || '').trim().toLowerCase();
  if (rawId.startsWith('news:')) return { source_kind: 'news', source_id: rawId.slice(5) };
  if (rawId.startsWith('mission:')) return { source_kind: 'mission_submission', source_id: rawId.slice(8) };
  if (rawId.startsWith('poll:')) return { source_kind: 'poll', source_id: rawId.slice(5) };
  if (rawId.startsWith('shout_out:')) return { source_kind: 'recognition', source_id: rawId.slice(10) };
  if (rawId.startsWith('recognition:')) return { source_kind: 'recognition', source_id: rawId.slice(12) };
  if (source === 'news') return { source_kind: 'news', source_id: rawId };
  if (source === 'mission') return { source_kind: 'mission_submission', source_id: rawId };
  if (source === 'poll') return { source_kind: 'poll', source_id: rawId };
  if (source === 'shout_out' || source === 'recognition') return { source_kind: 'recognition', source_id: rawId };
  if (source === 'feed' || source === 'feed_item') return { source_kind: 'feed', source_id: rawId };
  if (source === 'trivia') return { source_kind: 'trivia', source_id: rawId };
  return null;
}

async function safeFirst(stmt) {
  try {
    return (await stmt) || null;
  } catch (_) {
    return null;
  }
}

async function safeAll(stmt) {
  try {
    const res = await stmt;
    return (res && res.results) || [];
  } catch (_) {
    return [];
  }
}

export async function loadThumbnailSidecar(db, sourceKind, sourceId) {
  const kind = normalizeSourceKind(sourceKind);
  const id = normalizeSourceId(sourceId);
  if (!db || !isSupportedSourceKind(kind) || !id) return null;
  return safeFirst(
    db
      .prepare(
        'SELECT source_kind, source_id, original_object_key, image_version, thumbnail_object_key, thumbnail_mime_type, thumbnail_size_bytes, thumbnail_width, thumbnail_height, thumbnail_generated_at, created_at FROM lantern_image_thumbnails WHERE source_kind = ? AND source_id = ?'
      )
      .bind(kind, id)
      .first()
  );
}

export async function resolveSourceOriginal(db, sourceKind, sourceId) {
  const kind = normalizeSourceKind(sourceKind);
  const id = normalizeSourceId(sourceId);
  if (!db || !isSupportedSourceKind(kind) || !id) return null;
  if (kind === 'news') {
    const row = await safeFirst(
      db
        .prepare(
          'SELECT id, status, hidden_at, actor_id, author_name, author_type, image_r2_key, full_image_r2_key FROM lantern_news_submissions WHERE id = ?'
        )
        .bind(id)
        .first()
    );
    if (!row) return null;
    const key = String(row.image_r2_key || row.full_image_r2_key || '').trim();
    return { source_kind: kind, source_id: id, original_object_key: key, row: row };
  }
  if (kind === 'feed') {
    const row = await safeFirst(
      db
        .prepare(
          'SELECT id, status, hidden_at, author_id, author_display_name, image_r2_key FROM lantern_feed_items WHERE id = ?'
        )
        .bind(id)
        .first()
    );
    if (!row) return null;
    return { source_kind: kind, source_id: id, original_object_key: String(row.image_r2_key || '').trim(), row: row };
  }
  if (kind === 'recognition') {
    const row = await safeFirst(
      db
        .prepare(
          'SELECT id, character_name, image_r2_key, full_image_r2_key FROM lantern_teacher_recognition WHERE id = ?'
        )
        .bind(id)
        .first()
    );
    if (!row) return null;
    return {
      source_kind: kind,
      source_id: id,
      original_object_key: String(row.image_r2_key || row.full_image_r2_key || '').trim(),
      row: row,
    };
  }
  if (kind === 'mission_submission') {
    const row = await safeFirst(
      db
        .prepare(
          'SELECT id, character_name, status, hidden_at, submission_content FROM lantern_mission_submissions WHERE id = ?'
        )
        .bind(id)
        .first()
    );
    if (!row) return null;
    return {
      source_kind: kind,
      source_id: id,
      original_object_key: extractNewsObjectKeyFromUrl(row.submission_content),
      row: row,
    };
  }
  if (kind === 'poll') {
    const row = await safeFirst(
      db
        .prepare(
          'SELECT id, character_name, created_by_character, approved_at, hidden_at, image_url FROM lantern_polls WHERE id = ?'
        )
        .bind(id)
        .first()
    );
    if (!row) return null;
    return { source_kind: kind, source_id: id, original_object_key: extractNewsObjectKeyFromUrl(row.image_url), row: row };
  }
  if (kind === 'poll_contribution') {
    const row = await safeFirst(
      db
        .prepare('SELECT id, character_name, status, image_url FROM lantern_poll_contributions WHERE id = ?')
        .bind(id)
        .first()
    );
    if (!row) return null;
    return { source_kind: kind, source_id: id, original_object_key: extractNewsObjectKeyFromUrl(row.image_url), row: row };
  }
  if (kind === 'trivia') {
    const row = await safeFirst(
      db
        .prepare(
          'SELECT id, status, live, hidden_at, author_id, author_display_name, image_r2_key FROM lantern_trivia_questions WHERE id = ?'
        )
        .bind(id)
        .first()
    );
    if (!row) return null;
    return { source_kind: kind, source_id: id, original_object_key: String(row.image_r2_key || '').trim(), row: row };
  }
  return null;
}

function ownsSource(account, source, pilotEconomyCharacterName) {
  if (!account || !source || !source.row) return false;
  const row = source.row;
  switch (source.source_kind) {
    case 'news':
      return accountOwnsNewsRow(account, row, pilotEconomyCharacterName);
    case 'feed':
    case 'trivia':
      return accountOwnsFeedItem(account, row, pilotEconomyCharacterName);
    case 'mission_submission':
      return accountOwnsMissionSubmission(account, row, pilotEconomyCharacterName);
    case 'poll':
    case 'poll_contribution':
      return accountOwnsPollRow(account, row, pilotEconomyCharacterName);
    case 'recognition':
      return false;
    default:
      return false;
  }
}

export function canWriteThumbnail(account, source, pilotEconomyCharacterName) {
  if (!account || !source) return false;
  if (isTeacherLike(account.role)) return true;
  return ownsSource(account, source, pilotEconomyCharacterName);
}

export async function touchSidecarForOriginal(db, sourceKind, sourceId, originalObjectKey) {
  const kind = normalizeSourceKind(sourceKind);
  const id = normalizeSourceId(sourceId);
  const key = originalObjectKey == null ? '' : String(originalObjectKey).trim();
  if (!db || !isSupportedSourceKind(kind) || !id || !key) return { ok: false, reason: 'invalid' };
  const now = new Date().toISOString();
  const existing = await loadThumbnailSidecar(db, kind, id);
  if (!existing) {
    try {
      await db
        .prepare(
          'INSERT INTO lantern_image_thumbnails (source_kind, source_id, original_object_key, image_version, created_at) VALUES (?, ?, ?, 1, ?)'
        )
        .bind(kind, id, key, now)
        .run();
      return { ok: true, image_version: 1, created: true };
    } catch (_) {
      return { ok: false, reason: 'insert_failed' };
    }
  }
  if (String(existing.original_object_key || '').trim() === key) {
    return { ok: true, image_version: getImageVersion(existing.image_version), unchanged: true };
  }
  const nextVersion = getImageVersion(existing.image_version) + 1;
  try {
    await db
      .prepare(
        'UPDATE lantern_image_thumbnails SET original_object_key = ?, image_version = ?, thumbnail_object_key = NULL, thumbnail_mime_type = NULL, thumbnail_size_bytes = NULL, thumbnail_width = NULL, thumbnail_height = NULL, thumbnail_generated_at = NULL WHERE source_kind = ? AND source_id = ?'
      )
      .bind(key, nextVersion, kind, id)
      .run();
    return { ok: true, image_version: nextVersion, invalidated: true };
  } catch (_) {
    return { ok: false, reason: 'invalidate_failed' };
  }
}

export function validateThumbnailBytes(bytes, width, height) {
  if (!bytes || !(bytes.byteLength > 0)) return { error: 'Thumbnail is empty.', status: 400 };
  if (bytes.byteLength > THUMBNAIL_UPLOAD_MAX_BYTES) return { error: 'Thumbnail is too large.', status: 413 };
  const w = Number(width);
  const h = Number(height);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    return { error: 'Thumbnail width and height are required.', status: 400 };
  }
  if (w > THUMBNAIL_MAX_DIMENSION || h > THUMBNAIL_MAX_DIMENSION) {
    return { error: 'Thumbnail dimensions are invalid.', status: 400 };
  }
  return { ok: true, width: w, height: h };
}

export async function writeThumbnailMetadata(db, opts) {
  const kind = normalizeSourceKind(opts && opts.source_kind);
  const id = normalizeSourceId(opts && opts.source_id);
  const expectedVersion = getImageVersion(opts && opts.image_version);
  const expectedOriginal = opts && opts.original_object_key != null ? String(opts.original_object_key).trim() : '';
  const objectKey = opts && opts.thumbnail_object_key != null ? String(opts.thumbnail_object_key).trim() : '';
  if (!db || !isSupportedSourceKind(kind) || !id || !expectedOriginal || !isNewsThumbObjectKey(objectKey)) {
    return { ok: false, error: 'invalid_thumbnail_write', status: 400 };
  }
  const now = new Date().toISOString();
  const existing = await loadThumbnailSidecar(db, kind, id);
  if (!existing) {
    if (expectedVersion !== 1) return { ok: false, error: 'image_version_changed', status: 409 };
    try {
      const ins = await db
        .prepare(
          'INSERT INTO lantern_image_thumbnails (source_kind, source_id, original_object_key, image_version, thumbnail_object_key, thumbnail_mime_type, thumbnail_size_bytes, thumbnail_width, thumbnail_height, thumbnail_generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          kind,
          id,
          expectedOriginal,
          expectedVersion,
          objectKey,
          THUMBNAIL_JPEG_MIME,
          opts.size_bytes,
          opts.width,
          opts.height,
          now,
          now
        )
        .run();
      if (!ins || (ins.meta && Number(ins.meta.changes) === 0)) {
        return { ok: false, error: 'image_version_changed', status: 409 };
      }
      return { ok: true, image_version: expectedVersion, thumbnail_object_key: objectKey };
    } catch (_) {
      return { ok: false, error: 'metadata_write_failed', status: 500 };
    }
  }
  const upd = await db
    .prepare(
      'UPDATE lantern_image_thumbnails SET thumbnail_object_key = ?, thumbnail_mime_type = ?, thumbnail_size_bytes = ?, thumbnail_width = ?, thumbnail_height = ?, thumbnail_generated_at = ? WHERE source_kind = ? AND source_id = ? AND image_version = ? AND original_object_key = ?'
    )
    .bind(
      objectKey,
      THUMBNAIL_JPEG_MIME,
      opts.size_bytes,
      opts.width,
      opts.height,
      now,
      kind,
      id,
      expectedVersion,
      expectedOriginal
    )
    .run();
  if (!upd || !upd.meta || Number(upd.meta.changes) === 0) {
    return { ok: false, error: 'image_version_changed', status: 409 };
  }
  return { ok: true, image_version: expectedVersion, thumbnail_object_key: objectKey };
}

export async function attachStoredThumbnails(db, origin, items) {
  if (!db || !Array.isArray(items) || !items.length) return items;
  const refs = [];
  for (let i = 0; i < items.length; i++) {
    const ref = feedItemThumbnailRef(items[i]);
    if (ref && isSupportedSourceKind(ref.source_kind) && normalizeSourceId(ref.source_id)) refs.push({ item: items[i], ref: ref });
  }
  if (!refs.length) return items;
  const kinds = Array.from(new Set(refs.map((r) => r.ref.source_kind)));
  const sidecars = [];
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[k];
    const ids = refs.filter((r) => r.ref.source_kind === kind).map((r) => r.ref.source_id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await safeAll(
      db
        .prepare(
          'SELECT source_kind, source_id, original_object_key, image_version, thumbnail_object_key FROM lantern_image_thumbnails WHERE source_kind = ? AND source_id IN (' +
            placeholders +
            ')'
        )
        .bind(kind, ...ids)
        .all()
    );
    for (let r = 0; r < rows.length; r++) sidecars.push(rows[r]);
  }
  const byRef = new Map();
  for (let s = 0; s < sidecars.length; s++) {
    const row = sidecars[s];
    byRef.set(String(row.source_kind) + '\0' + String(row.source_id), row);
  }
  for (let i = 0; i < refs.length; i++) {
    const item = refs[i].item;
    const ref = refs[i].ref;
    const side = byRef.get(ref.source_kind + '\0' + ref.source_id);
    if (!hasStoredThumbnail(side)) continue;
    const current = await resolveSourceOriginal(db, ref.source_kind, ref.source_id);
    if (!current || !current.original_object_key) continue;
    if (String(side.original_object_key || '').trim() !== String(current.original_object_key || '').trim()) continue;
    if (!isStudentOriginalObjectKey(current.original_object_key) && !current.original_object_key.startsWith('missions/card/')) {
      continue;
    }
    item.thumbnailUrl = mapStoredThumbnailUrl(origin, side);
    item.storedThumbnailUrl = item.thumbnailUrl;
    item.thumbnailSourceKind = ref.source_kind;
    item.thumbnailSourceId = ref.source_id;
    item.hasStoredThumbnail = true;
  }
  return items;
}

export function sidecarMatchesCurrentOriginal(sidecar, currentOriginalKey) {
  if (!sidecar || !hasStoredThumbnail(sidecar)) return false;
  return String(sidecar.original_object_key || '').trim() === String(currentOriginalKey || '').trim();
}

export { contentReferencesObjectKey };
