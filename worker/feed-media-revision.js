/**
 * Prompt #254B — Feed create/update media intent (keep / replace / remove).
 * Replacement bytes are uploaded inside the handler; client R2 keys are rejected.
 */

import { clearSidecarForSource, touchSidecarForOriginal } from './image-thumbnails.js';
import { putNewsImageBytes } from './news-media-upload.js';

export const FORBIDDEN_CLIENT_KEYS = ['image_r2_key', 'full_image_r2_key', 'video_r2_key'];

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function firstForbiddenKey(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== '') {
      return k;
    }
  }
  return '';
}

export function feedRevisionPayload(row, origin) {
  const imageKey = trimStr(row && row.image_r2_key);
  const originBase = trimStr(origin);
  return {
    id: row.id,
    type: row.type,
    title: row.title || '',
    body: row.body || row.summary || '',
    summary: row.summary || '',
    status: row.status,
    private_feedback: row.private_feedback || '',
    image_r2_key: imageKey || null,
    image_url: imageKey ? originBase + '/api/news/image?key=' + encodeURIComponent(imageKey) : null,
  };
}

/**
 * Resolve feed image key from explicit media_action for create/update.
 * @returns {{ ok: true, imageKey: string|null, sidecarTouchKey: string|null, sidecarClear: boolean } | { ok: false, error: string, status?: number }}
 */
export async function resolveFeedImageFromMediaAction(body, priorImageKey, bucket) {
  let mediaAction = trimStr(body && body.media_action).toLowerCase();
  if (!mediaAction) {
    if (body && body.image) mediaAction = 'replace';
    else mediaAction = 'keep';
  }
  if (mediaAction !== 'keep' && mediaAction !== 'replace' && mediaAction !== 'remove') {
    return { ok: false, error: 'invalid_media_action', status: 400 };
  }

  const priorKey = trimStr(priorImageKey) || null;
  if (mediaAction === 'keep') {
    return { ok: true, imageKey: priorKey, sidecarTouchKey: null, sidecarClear: false };
  }
  if (mediaAction === 'remove') {
    return { ok: true, imageKey: null, sidecarTouchKey: null, sidecarClear: !!priorKey };
  }

  const uploaded = await putNewsImageBytes(bucket, {
    image: body.image,
    mime_type: body.mime_type,
    file_name: body.file_name || 'image.png',
  });
  if (!uploaded.ok) return { ok: false, error: uploaded.error, status: uploaded.status || 400 };
  return {
    ok: true,
    imageKey: uploaded.image_r2_key,
    sidecarTouchKey: uploaded.image_r2_key,
    sidecarClear: false,
  };
}

export function rejectClientMediaKeys(body) {
  const clientKey = firstForbiddenKey(body, FORBIDDEN_CLIENT_KEYS);
  if (clientKey) return { ok: false, error: 'client_media_key_not_allowed', param: clientKey };
  return { ok: true };
}

export async function applyFeedSidecar(db, feedId, sidecarTouchKey, sidecarClear) {
  if (!feedId) return;
  if (sidecarClear) {
    try {
      await clearSidecarForSource(db, 'feed', feedId);
    } catch (_) {}
    return;
  }
  if (sidecarTouchKey) {
    try {
      await touchSidecarForOriginal(db, 'feed', feedId, sidecarTouchKey);
    } catch (_) {}
  }
}

export const feedMediaRevisionTest = {
  FORBIDDEN_CLIENT_KEYS,
};
