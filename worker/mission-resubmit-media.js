/**
 * Prompt #254B — mission submission resubmit media intent + content normalization.
 */

import { extractNewsObjectKeyFromUrl, clearSidecarForSource, touchSidecarForOriginal, isStudentOriginalObjectKey } from './image-thumbnails.js';
import { putNewsImageBytes, putNewsVideoBytes } from './news-media-upload.js';
import { extractMissionSubmissionMedia } from './missions-auth.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function parseTextEnvelope(raw) {
  const s = String(raw || '').trim();
  if (s.length < 2 || s.charCodeAt(0) !== 123) return { isEnvelope: false, text: '', image_url: '' };
  try {
    const parsed = JSON.parse(s);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (typeof parsed.text === 'string' || typeof parsed.image_url === 'string')
    ) {
      return {
        isEnvelope: true,
        text: String(parsed.text || '').trim(),
        image_url: String(parsed.image_url || '').trim(),
      };
    }
  } catch (_) {}
  return { isEnvelope: false, text: '', image_url: '' };
}

function deliveryUrlFromKey(origin, key) {
  const k = trimStr(key);
  if (!k) return '';
  return trimStr(origin) + '/api/news/image?key=' + encodeURIComponent(k);
}

/**
 * Build normalized submission_content from resubmit body + prior row.
 */
export async function buildMissionResubmitContent(body, row, origin, bucket) {
  const st = trimStr(row.submission_type);
  const priorRaw = row.submission_content != null ? String(row.submission_content) : '';
  let mediaAction = trimStr(body.media_action).toLowerCase();
  if (!mediaAction) mediaAction = 'keep';
  if (mediaAction !== 'keep' && mediaAction !== 'replace' && mediaAction !== 'remove') {
    return { ok: false, error: 'invalid_media_action', status: 400 };
  }

  if (st === 'poll' || st === 'bug_report' || st === 'confirmation') {
    const content = trimStr(body.submission_content).slice(0, st === 'poll' || st === 'bug_report' ? 4000 : 2000);
    return { ok: true, content, sidecarTouchKey: null, sidecarClear: false };
  }

  const priorMedia = extractMissionSubmissionMedia(st, priorRaw);
  const textIn = trimStr(body.submission_content);
  const envelope = st === 'text' ? parseTextEnvelope(textIn) : { isEnvelope: false, text: '', image_url: '' };
  const textPart = envelope.isEnvelope ? envelope.text : textIn;

  if (st === 'image_url') {
    if (mediaAction === 'keep') {
      return { ok: true, content: priorRaw.trim(), sidecarTouchKey: null, sidecarClear: false };
    }
    if (mediaAction === 'remove') {
      return { ok: true, content: '', sidecarTouchKey: null, sidecarClear: !!priorRaw.trim() };
    }
    const kind = trimStr(body.media_kind).toLowerCase() || 'image';
    if (kind === 'image') {
      const uploaded = await putNewsImageBytes(bucket, {
        image: body.image,
        mime_type: body.mime_type,
        file_name: body.file_name || 'image.png',
      });
      if (!uploaded.ok) return { ok: false, error: uploaded.error, status: uploaded.status || 400 };
      const url = deliveryUrlFromKey(origin, uploaded.image_r2_key);
      return {
        ok: true,
        content: url.slice(0, 2000),
        sidecarTouchKey: uploaded.image_r2_key,
        sidecarClear: false,
      };
    }
    return { ok: false, error: 'invalid_media_kind', status: 400 };
  }

  if (st === 'video') {
    if (mediaAction === 'keep') {
      return { ok: true, content: priorRaw.trim(), sidecarTouchKey: null, sidecarClear: false };
    }
    if (mediaAction === 'remove') {
      return { ok: true, content: '', sidecarTouchKey: null, sidecarClear: false };
    }
    const uploaded = await putNewsVideoBytes(bucket, {
      video: body.video,
      mime_type: body.mime_type,
      file_name: body.file_name || 'video.mp4',
    });
    if (!uploaded.ok) return { ok: false, error: uploaded.error, status: uploaded.status || 400 };
    const url = trimStr(origin) + '/api/news/video?key=' + encodeURIComponent(uploaded.video_r2_key);
    return { ok: true, content: url.slice(0, 2000), sidecarTouchKey: null, sidecarClear: false };
  }

  if (st === 'link') {
    if (mediaAction === 'keep') {
      return { ok: true, content: priorRaw.trim(), sidecarTouchKey: null, sidecarClear: false };
    }
    if (mediaAction === 'remove') {
      return { ok: true, content: '', sidecarTouchKey: null, sidecarClear: false };
    }
    const linkUrl = trimStr(body.link_url).slice(0, 2000);
    if (!linkUrl || !/^https?:\/\//i.test(linkUrl)) {
      return { ok: false, error: 'Invalid link_url', status: 400 };
    }
    return { ok: true, content: linkUrl, sidecarTouchKey: null, sidecarClear: false };
  }

  // text — plain or {text, image_url} envelope when mission allows image
  const priorEnv = parseTextEnvelope(priorRaw);
  const hadImage = !!(priorEnv.isEnvelope ? priorEnv.image_url : priorMedia.image_url);
  const priorImageUrl = priorEnv.isEnvelope ? priorEnv.image_url : priorMedia.image_url || '';

  if (mediaAction === 'keep') {
    if (priorEnv.isEnvelope || hadImage) {
      const out = JSON.stringify({
        text: textPart.slice(0, 1800),
        image_url: priorImageUrl.slice(0, 500),
      });
      return { ok: true, content: out, sidecarTouchKey: null, sidecarClear: false };
    }
    return { ok: true, content: textPart.slice(0, 2000), sidecarTouchKey: null, sidecarClear: false };
  }

  if (mediaAction === 'remove') {
    const sidecarClear = !!extractNewsObjectKeyFromUrl(priorImageUrl);
    if (priorEnv.isEnvelope || hadImage) {
      return {
        ok: true,
        content: JSON.stringify({ text: textPart.slice(0, 1800) }),
        sidecarTouchKey: null,
        sidecarClear,
      };
    }
    return { ok: true, content: textPart.slice(0, 2000), sidecarTouchKey: null, sidecarClear: false };
  }

  // replace
  const kind = trimStr(body.media_kind).toLowerCase() || 'image';
  if (kind === 'image') {
    const uploaded = await putNewsImageBytes(bucket, {
      image: body.image,
      mime_type: body.mime_type,
      file_name: body.file_name || 'image.png',
    });
    if (!uploaded.ok) return { ok: false, error: uploaded.error, status: uploaded.status || 400 };
    const url = deliveryUrlFromKey(origin, uploaded.image_r2_key);
    const out = JSON.stringify({ text: textPart.slice(0, 1800), image_url: url.slice(0, 500) });
    return {
      ok: true,
      content: out,
      sidecarTouchKey: uploaded.image_r2_key,
      sidecarClear: false,
    };
  }
  if (kind === 'video') {
    const uploaded = await putNewsVideoBytes(bucket, {
      video: body.video,
      mime_type: body.mime_type,
      file_name: body.file_name || 'video.mp4',
    });
    if (!uploaded.ok) return { ok: false, error: uploaded.error, status: uploaded.status || 400 };
    const url = trimStr(origin) + '/api/news/video?key=' + encodeURIComponent(uploaded.video_r2_key);
    return { ok: true, content: url.slice(0, 2000), sidecarTouchKey: null, sidecarClear: false };
  }
  if (kind === 'link') {
    const linkUrl = trimStr(body.link_url).slice(0, 2000);
    if (!linkUrl || !/^https?:\/\//i.test(linkUrl)) {
      return { ok: false, error: 'Invalid link_url', status: 400 };
    }
    return { ok: true, content: linkUrl, sidecarTouchKey: null, sidecarClear: false };
  }
  return { ok: false, error: 'invalid_media_kind', status: 400 };
}

export async function applyMissionSubmissionSidecar(db, submissionId, imageUrlOrKey, sidecarTouchKey, sidecarClear) {
  if (!submissionId) return;
  if (sidecarClear) {
    try {
      await clearSidecarForSource(db, 'mission_submission', submissionId);
    } catch (_) {}
    return;
  }
  const key = sidecarTouchKey || extractNewsObjectKeyFromUrl(imageUrlOrKey);
  if (key && isStudentOriginalObjectKey(key)) {
    try {
      await touchSidecarForOriginal(db, 'mission_submission', submissionId, key);
    } catch (_) {}
  }
}

export const missionResubmitMediaTest = {
  parseTextEnvelope,
};
