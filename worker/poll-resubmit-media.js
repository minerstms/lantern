/**
 * Prompt #254B — poll contribution resubmit media intent.
 */

import {
  extractNewsObjectKeyFromUrl,
  clearSidecarForSource,
  touchSidecarForOriginal,
  isStudentOriginalObjectKey,
} from './image-thumbnails.js';
import { putNewsImageBytes } from './news-media-upload.js';

const ALLOWED_FB = ['poll', 'news', 'creation', 'generic', 'shoutout', 'explain'];

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function isRealStudentImageUrl(url) {
  const key = extractNewsObjectKeyFromUrl(url);
  return !!(key && isStudentOriginalObjectKey(key));
}

function deliveryUrlFromKey(origin, key) {
  const k = trimStr(key);
  if (!k) return null;
  return trimStr(origin) + '/api/news/image?key=' + encodeURIComponent(k);
}

/**
 * @param {object} body - resubmit JSON body
 * @param {object} priorRow - existing contribution row
 * @param {string} origin - request origin
 * @param {object} bucket - R2 bucket
 */
export async function resolvePollContributionMedia(body, priorRow, origin, bucket) {
  let mediaAction = trimStr(body.media_action).toLowerCase();
  if (!mediaAction) mediaAction = 'keep';
  if (mediaAction !== 'keep' && mediaAction !== 'replace' && mediaAction !== 'remove') {
    return { ok: false, error: 'invalid_media_action', status: 400 };
  }

  const priorUrl = trimStr(priorRow && priorRow.image_url) || null;
  const priorHadRealImage = isRealStudentImageUrl(priorUrl);

  if (mediaAction === 'keep') {
    return {
      ok: true,
      imageUrl: priorUrl,
      fallbackKey: priorUrl ? null : trimStr(priorRow && priorRow.fallback_key) || 'poll',
      sidecarTouchKey: null,
      sidecarClear: false,
    };
  }

  if (mediaAction === 'remove') {
    const fbRaw = trimStr(body.fallback_key);
    const fallbackKey = ALLOWED_FB.includes(fbRaw) ? fbRaw : 'poll';
    return {
      ok: true,
      imageUrl: null,
      fallbackKey,
      sidecarTouchKey: null,
      sidecarClear: priorHadRealImage,
    };
  }

  const uploaded = await putNewsImageBytes(bucket, {
    image: body.image,
    mime_type: body.mime_type,
    file_name: body.file_name || 'poll.png',
  });
  if (!uploaded.ok) return { ok: false, error: uploaded.error, status: uploaded.status || 400 };
  const imageUrl = deliveryUrlFromKey(origin, uploaded.image_r2_key);
  return {
    ok: true,
    imageUrl,
    fallbackKey: null,
    sidecarTouchKey: uploaded.image_r2_key,
    sidecarClear: false,
  };
}

export async function applyPollContributionSidecar(db, contribId, sidecarTouchKey, sidecarClear) {
  if (!contribId) return;
  if (sidecarClear) {
    try {
      await clearSidecarForSource(db, 'poll_contribution', contribId);
    } catch (_) {}
    return;
  }
  if (sidecarTouchKey && isStudentOriginalObjectKey(sidecarTouchKey)) {
    try {
      await touchSidecarForOriginal(db, 'poll_contribution', contribId, sidecarTouchKey);
    } catch (_) {}
  }
}

export const pollResubmitMediaTest = {
  ALLOWED_FB,
  isRealStudentImageUrl,
};
