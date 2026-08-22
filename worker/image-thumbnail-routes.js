/**
 * Prompt #249B — dedicated thumbnail GET/write/backfill routes.
 * Authorization is always authorizeNewsMediaDelivery(original_object_key).
 * Never redirects to the original. Never serves a thumb from a guessed key.
 */
import { authorizeNewsMediaDelivery } from './news-media-delivery.js';
import { isTeacherLike } from './missions-auth.js';
import { isNewsImageObjectKey } from './r2-key-guards.js';
import { isNewsDeliveryObjectKey } from './protected-content.js';
import {
  SOURCE_KINDS,
  THUMBNAIL_JPEG_MIME,
  buildThumbnailDeliveryUrl,
  buildThumbnailObjectKey,
  canWriteThumbnail,
  extractNewsObjectKeyFromUrl,
  missionSubmissionOriginalKey,
  getImageVersion,
  hasStoredThumbnail,
  isNewsThumbObjectKey,
  isStudentOriginalObjectKey,
  isSupportedSourceKind,
  loadThumbnailSidecar,
  mapStoredThumbnailUrl,
  normalizeSourceId,
  normalizeSourceKind,
  resolveSourceOriginal,
  sidecarHasCurrentThumbnail,
  sidecarMatchesCurrentOriginal,
  touchSidecarForOriginal,
  validateThumbnailBytes,
  writeThumbnailMetadata,
} from './image-thumbnails.js';

function stripBase64Payload(raw) {
  const s = raw == null ? '' : String(raw);
  const idx = s.indexOf('base64,');
  return idx >= 0 ? s.slice(idx + 7) : s;
}

function decodeThumbBytes(raw) {
  const base64 = stripBase64Payload(raw);
  if (!base64) return null;
  try {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch (_) {
    return null;
  }
}

function originalIsDeliverable(key) {
  const k = key == null ? '' : String(key).trim();
  if (!k) return false;
  return isNewsDeliveryObjectKey(k) || isNewsImageObjectKey(k);
}

async function parseJsonBody(request) {
  try {
    const text = await request.text();
    return JSON.parse(text || '{}');
  } catch (_) {
    return null;
  }
}

function sourceIsPubliclyEligible(source) {
  if (!source || !source.row) return false;
  const row = source.row;
  const hidden = !!(row.hidden_at && String(row.hidden_at).trim());
  const status = String(row.status || '').trim().toLowerCase();
  if (source.source_kind === 'news') return status === 'approved' && !hidden;
  if (source.source_kind === 'feed') return status === 'approved' && !hidden;
  if (source.source_kind === 'mission_submission') return status === 'accepted' && !hidden;
  if (source.source_kind === 'poll') return !!(row.approved_at && String(row.approved_at).trim()) && !hidden;
  if (source.source_kind === 'poll_contribution') return status === 'approved';
  if (source.source_kind === 'trivia') return status === 'approved' && Number(row.live) === 1 && !hidden;
  if (source.source_kind === 'recognition') return true;
  return false;
}

export { sourceIsPubliclyEligible };

export async function listBackfillCandidates(db, origin, opts) {
  const maxItems = Math.min(200, Math.max(1, parseInt((opts && opts.maxItems) || '50', 10) || 50));
  const onlyKind = opts && opts.sourceKind ? normalizeSourceKind(opts.sourceKind) : '';
  const onlyId = opts && opts.sourceId ? normalizeSourceId(opts.sourceId) : '';
  const recover = !!(opts && opts.recover);
  const cursor = opts && opts.cursor ? String(opts.cursor).trim() : '';
  const out = [];

  async function consider(kind, id, originalKey) {
    if (!isSupportedSourceKind(kind) || !id || !originalKey) return;
    if (onlyKind && kind !== onlyKind) return;
    if (onlyId && id !== onlyId) return;
    if (!isStudentOriginalObjectKey(originalKey) && !String(originalKey).startsWith('missions/card/')) return;
    const source = await resolveSourceOriginal(db, kind, id);
    if (!source || !sourceIsPubliclyEligible(source)) return;
    if (String(source.original_object_key || '').trim() !== String(originalKey).trim()) return;
    const side = await loadThumbnailSidecar(db, kind, id);
    const complete = sidecarHasCurrentThumbnail(side, originalKey);
    if (complete && !recover) return;
    out.push({
      source_kind: kind,
      source_id: id,
      original_object_key: originalKey,
      image_version: side ? getImageVersion(side.image_version) : 1,
      file_url: origin + '/api/news/image?key=' + encodeURIComponent(originalKey),
      has_sidecar: !!side,
      has_thumbnail: hasStoredThumbnail(side),
      sidecar_pending_thumbnail: !!(side && !hasStoredThumbnail(side)),
      expected_thumbnail_object_key: buildThumbnailObjectKey(kind, id, side ? getImageVersion(side.image_version) : 1),
    });
  }

  if (onlyId) {
    const kinds = onlyKind ? [onlyKind] : SOURCE_KINDS;
    for (let i = 0; i < kinds.length; i++) {
      const source = await resolveSourceOriginal(db, kinds[i], onlyId);
      if (!source || !source.original_object_key) continue;
      await consider(source.source_kind, source.source_id, source.original_object_key);
      if (out.length >= maxItems) break;
    }
    return out.slice(0, maxItems);
  }

  const news = await db
    .prepare(
      "SELECT id, image_r2_key, full_image_r2_key FROM lantern_news_submissions WHERE LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '') AND (image_r2_key IS NOT NULL AND image_r2_key != '') ORDER BY id ASC LIMIT ?"
    )
    .bind(400)
    .all()
    .catch(() => ({ results: [] }));
  for (const row of news.results || []) {
    await consider('news', row.id, String(row.image_r2_key || row.full_image_r2_key || '').trim());
    if (out.length >= maxItems) break;
  }

  if (out.length < maxItems) {
    const polls = await db
      .prepare(
        "SELECT id, image_url FROM lantern_polls WHERE approved_at IS NOT NULL AND approved_at != '' AND (hidden_at IS NULL OR hidden_at = '') AND image_url IS NOT NULL AND image_url != '' ORDER BY id ASC LIMIT ?"
      )
      .bind(200)
      .all()
      .catch(() => ({ results: [] }));
    for (const row of polls.results || []) {
      await consider('poll', row.id, extractNewsObjectKeyFromUrl(row.image_url));
      if (out.length >= maxItems) break;
    }
  }

  if (out.length < maxItems) {
    const recs = await db
      .prepare(
        "SELECT id, image_r2_key, full_image_r2_key FROM lantern_teacher_recognition WHERE (image_r2_key IS NOT NULL AND image_r2_key != '') ORDER BY id ASC LIMIT ?"
      )
      .bind(200)
      .all()
      .catch(() => ({ results: [] }));
    for (const row of recs.results || []) {
      await consider('recognition', row.id, String(row.image_r2_key || row.full_image_r2_key || '').trim());
      if (out.length >= maxItems) break;
    }
  }

  if (out.length < maxItems) {
    const missions = await db
      .prepare(
        "SELECT id, submission_type, submission_content FROM lantern_mission_submissions WHERE LOWER(TRIM(status)) = 'accepted' AND (hidden_at IS NULL OR hidden_at = '') ORDER BY id ASC LIMIT ?"
      )
      .bind(200)
      .all()
      .catch(() => ({ results: [] }));
    for (const row of missions.results || []) {
      await consider('mission_submission', row.id, missionSubmissionOriginalKey(row));
      if (out.length >= maxItems) break;
    }
  }

  if (cursor) {
    const idx = out.findIndex((c) => c.source_kind + ':' + c.source_id === cursor);
    return idx >= 0 ? out.slice(idx + 1, idx + 1 + maxItems) : out.slice(0, maxItems);
  }
  return out.slice(0, maxItems);
}

export async function handleNewsThumbnailRoutes(request, url, path, env, cors, deps) {
  const {
    getPilotAccountFromRequest,
    pilotAccountRequiresChangePassword,
    pilotEconomyCharacterName,
    jsonResponse,
    corsForPilot,
    requireStaffPilotSession,
    protectedDeliveryHeaders,
  } = deps;
  const db = env.DB;
  const bucket = env.NEWS_BUCKET || env.AVATAR_BUCKET;
  const origin = url.origin || '';

  if (request.method === 'GET' && path === '/api/news/thumb') {
    const kind = normalizeSourceKind(url.searchParams.get('source_kind'));
    const id = normalizeSourceId(url.searchParams.get('source_id'));
    if (!isSupportedSourceKind(kind) || !id) {
      return jsonResponse({ ok: false, error: 'invalid_source' }, 400, cors);
    }
    const viewer = await getPilotAccountFromRequest(request, env);
    if (!viewer) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, corsForPilot(request));
    if (pilotAccountRequiresChangePassword(viewer)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, corsForPilot(request));
    }
    const source = await resolveSourceOriginal(db, kind, id);
    if (!source || !source.original_object_key || !originalIsDeliverable(source.original_object_key)) {
      return new Response('Not Found', { status: 404, headers: corsForPilot(request) });
    }
    const mediaAuth = await authorizeNewsMediaDelivery(db, viewer, source.original_object_key, {
      pilotEconomyCharacterName: pilotEconomyCharacterName,
    });
    if (!mediaAuth.ok) {
      return new Response('Not Found', { status: 404, headers: corsForPilot(request) });
    }
    const sidecar = await loadThumbnailSidecar(db, kind, id);
    if (!sidecarMatchesCurrentOriginal(sidecar, source.original_object_key) || !isNewsThumbObjectKey(sidecar.thumbnail_object_key)) {
      return new Response('Not Found', { status: 404, headers: corsForPilot(request) });
    }
    if (!bucket) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, cors);
    const obj = await bucket.get(sidecar.thumbnail_object_key);
    if (!obj) return new Response('Not Found', { status: 404, headers: corsForPilot(request) });
    return new Response(obj.body, {
      status: 200,
      headers: Object.assign(
        protectedDeliveryHeaders(obj.httpMetadata?.contentType || THUMBNAIL_JPEG_MIME, corsForPilot(request)),
        { 'X-Thumbnail-Source': 'stored' }
      ),
    });
  }

  if (request.method === 'POST' && path === '/api/news/thumb') {
    const writeCors = corsForPilot(request);
    const viewer = await getPilotAccountFromRequest(request, env);
    if (!viewer) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, writeCors);
    if (pilotAccountRequiresChangePassword(viewer)) {
      return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, writeCors);
    }
    const body = await parseJsonBody(request);
    if (!body) return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, writeCors);
    const kind = normalizeSourceKind(body.source_kind);
    const id = normalizeSourceId(body.source_id);
    if (!isSupportedSourceKind(kind) || !id) {
      return jsonResponse({ ok: false, error: 'invalid_source' }, 400, writeCors);
    }
    const source = await resolveSourceOriginal(db, kind, id);
    if (!source) return jsonResponse({ ok: false, error: 'not_found' }, 404, writeCors);
    if (!canWriteThumbnail(viewer, source, pilotEconomyCharacterName)) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, writeCors);
    }
    const currentKey = String(source.original_object_key || '').trim();
    const submittedKey = String(body.original_object_key || '').trim();
    if (!currentKey || submittedKey !== currentKey) {
      return jsonResponse({ ok: false, error: 'image_version_changed' }, 409, writeCors);
    }
    await touchSidecarForOriginal(db, kind, id, currentKey);
    const sidecar = await loadThumbnailSidecar(db, kind, id);
    const currentVersion = sidecar ? getImageVersion(sidecar.image_version) : 1;
    if (getImageVersion(body.image_version) !== currentVersion) {
      return jsonResponse({ ok: false, error: 'image_version_changed', image_version: currentVersion }, 409, writeCors);
    }
    const bytes = decodeThumbBytes(body.thumbnail || body.image);
    const validation = validateThumbnailBytes(bytes, body.width || body.thumbnail_width, body.height || body.thumbnail_height);
    if (!validation.ok) return jsonResponse({ ok: false, error: validation.error }, validation.status, writeCors);
    if (!bucket) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, writeCors);
    const objectKey = buildThumbnailObjectKey(kind, id, currentVersion);
    try {
      await bucket.put(objectKey, bytes, { httpMetadata: { contentType: THUMBNAIL_JPEG_MIME } });
    } catch (_) {
      return jsonResponse({ ok: false, error: 'thumbnail_upload_failed' }, 500, writeCors);
    }
    const written = await writeThumbnailMetadata(db, {
      source_kind: kind,
      source_id: id,
      image_version: currentVersion,
      original_object_key: currentKey,
      thumbnail_object_key: objectKey,
      size_bytes: bytes.byteLength,
      width: validation.width,
      height: validation.height,
    });
    if (!written.ok) {
      return jsonResponse({ ok: false, error: written.error || 'metadata_write_failed' }, written.status || 500, writeCors);
    }
    return jsonResponse(
      {
        ok: true,
        source_kind: kind,
        source_id: id,
        image_version: currentVersion,
        thumbnail_object_key: objectKey,
        thumbnail_url: buildThumbnailDeliveryUrl(origin, kind, id),
        size_bytes: bytes.byteLength,
        width: validation.width,
        height: validation.height,
      },
      200,
      writeCors
    );
  }

  if (request.method === 'GET' && path === '/api/news/thumbs/candidates') {
    const staffCors = corsForPilot(request);
    const staff = await requireStaffPilotSession(request, env, staffCors);
    if (staff.response) return staff.response;
    if (!isTeacherLike(staff.account.role)) return jsonResponse({ ok: false, error: 'forbidden' }, 403, staffCors);
    const dryRun = url.searchParams.get('dry_run') === '1' || url.searchParams.get('dry_run') === 'true';
    const maxItems = url.searchParams.get('max_items') || '50';
    const sourceKind = url.searchParams.get('source_kind') || '';
    const sourceId = url.searchParams.get('source_id') || '';
    const recover = !dryRun && (url.searchParams.get('recover') === '1' || url.searchParams.get('recover') === 'true');
    const cursor = url.searchParams.get('cursor') || '';
    let candidates = [];
    try {
      candidates = await listBackfillCandidates(db, origin, {
        maxItems: maxItems,
        sourceKind: sourceKind,
        sourceId: sourceId,
        recover: recover,
        cursor: cursor,
      });
    } catch (err) {
      return jsonResponse({ ok: false, error: 'candidates_unavailable', detail: String(err && err.message || err) }, 503, staffCors);
    }
    return jsonResponse(
      {
        ok: true,
        dry_run: dryRun,
        count: candidates.length,
        supported_source_kinds: SOURCE_KINDS,
        candidates: candidates,
        next_cursor: candidates.length ? candidates[candidates.length - 1].source_kind + ':' + candidates[candidates.length - 1].source_id : '',
      },
      200,
      staffCors
    );
  }

  if (request.method === 'POST' && path === '/api/news/thumbs/recognize') {
    const staffCors = corsForPilot(request);
    const staff = await requireStaffPilotSession(request, env, staffCors);
    if (staff.response) return staff.response;
    const body = await parseJsonBody(request);
    if (!body) return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, staffCors);
    const kind = normalizeSourceKind(body.source_kind);
    const id = normalizeSourceId(body.source_id);
    if (!isSupportedSourceKind(kind) || !id) return jsonResponse({ ok: false, error: 'invalid_source' }, 400, staffCors);
    const source = await resolveSourceOriginal(db, kind, id);
    if (!source || !source.original_object_key) return jsonResponse({ ok: false, error: 'not_found' }, 404, staffCors);
    await touchSidecarForOriginal(db, kind, id, source.original_object_key);
    const sidecar = await loadThumbnailSidecar(db, kind, id);
    const version = sidecar ? getImageVersion(sidecar.image_version) : 1;
    if (body.image_version != null && getImageVersion(body.image_version) !== version) {
      return jsonResponse({ ok: false, error: 'image_version_changed', image_version: version }, 409, staffCors);
    }
    const objectKey = buildThumbnailObjectKey(kind, id, version);
    if (!bucket) return jsonResponse({ ok: false, error: 'Bucket not configured' }, 503, staffCors);
    const existing = bucket.head ? await bucket.head(objectKey) : await bucket.get(objectKey);
    if (!existing) return jsonResponse({ ok: false, error: 'thumbnail_object_missing' }, 404, staffCors);
    const sizeBytes = typeof existing.size === 'number' ? existing.size : existing.body ? undefined : null;
    const written = await writeThumbnailMetadata(db, {
      source_kind: kind,
      source_id: id,
      image_version: version,
      original_object_key: source.original_object_key,
      thumbnail_object_key: objectKey,
      size_bytes: sizeBytes || 0,
      width: Number(body.width) || 1,
      height: Number(body.height) || 1,
    });
    if (!written.ok) return jsonResponse({ ok: false, error: written.error }, written.status || 500, staffCors);
    return jsonResponse(
      {
        ok: true,
        recognized: true,
        source_kind: kind,
        source_id: id,
        image_version: version,
        thumbnail_object_key: objectKey,
        thumbnail_url: mapStoredThumbnailUrl(origin, { source_kind: kind, source_id: id, thumbnail_object_key: objectKey }),
        size_bytes: sizeBytes || 0,
      },
      200,
      staffCors
    );
  }

  return null;
}
