/**
 * Prompt #254A — authoritative News image/video put helpers.
 * Keys are generated on the server. Callers must not accept client object keys.
 */

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_ALLOWED_MIME = ['video/mp4', 'video/webm'];

export function stripBase64Payload(dataUrlOrB64) {
  const s = String(dataUrlOrB64 || '').trim();
  if (!s) return '';
  const marker = ';base64,';
  const idx = s.indexOf(marker);
  if (idx !== -1) return s.slice(idx + marker.length).replace(/\s/g, '');
  return s.replace(/\s/g, '');
}

function decodeBase64Bytes(raw, label) {
  const base64 = stripBase64Payload(raw);
  if (!base64) return { error: 'Missing ' + label + ' payload' };
  try {
    return { bytes: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) };
  } catch (_) {
    return { error: 'Invalid base64 ' + label };
  }
}

export async function putNewsImageBytes(bucket, opts) {
  if (!bucket) return { ok: false, error: 'Bucket not configured', status: 503 };
  const decoded = decodeBase64Bytes(opts && opts.image, 'image');
  if (decoded.error) return { ok: false, error: decoded.error, status: 400 };
  if (decoded.bytes.length > IMAGE_MAX_BYTES) return { ok: false, error: 'Image too large (max 5MB)', status: 400 };
  const mime = String((opts && opts.mime_type) || 'image/png')
    .trim()
    .toLowerCase();
  if (!IMAGE_ALLOWED_MIME.includes(mime)) return { ok: false, error: 'Invalid mime type', status: 400 };
  const ext = mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpg' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'png';
  const fileName = String((opts && opts.file_name) || '').trim() || 'image.' + ext;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const id = 'news-' + crypto.randomUUID();
  const key = 'news/' + id + (safeName.includes('.') ? '' : '.' + ext);
  await bucket.put(key, decoded.bytes, { httpMetadata: { contentType: mime } });
  return {
    ok: true,
    image_r2_key: key,
    image_file_name: safeName,
    image_mime_type: mime,
    image_file_size: decoded.bytes.length,
  };
}

export async function putNewsVideoBytes(bucket, opts) {
  if (!bucket) return { ok: false, error: 'Bucket not configured', status: 503 };
  const decoded = decodeBase64Bytes(opts && opts.video, 'video');
  if (decoded.error) return { ok: false, error: decoded.error, status: 400 };
  if (decoded.bytes.length > VIDEO_MAX_BYTES) return { ok: false, error: 'Video too large (max 25MB)', status: 400 };
  const mime = String((opts && opts.mime_type) || 'video/mp4')
    .trim()
    .toLowerCase();
  if (!VIDEO_ALLOWED_MIME.includes(mime)) return { ok: false, error: 'Only MP4 and WebM are supported', status: 400 };
  const ext = mime === 'video/webm' ? 'webm' : 'mp4';
  const fileName = String((opts && opts.file_name) || '').trim() || 'video.' + ext;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const id = 'news-' + crypto.randomUUID();
  const key = 'news/video/' + id + (safeName.includes('.') ? '' : '.' + ext);
  await bucket.put(key, decoded.bytes, { httpMetadata: { contentType: mime } });
  return {
    ok: true,
    video_r2_key: key,
    video_file_name: safeName,
    video_mime_type: mime,
    video_file_size: decoded.bytes.length,
  };
}

export const newsMediaUploadTest = {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  IMAGE_ALLOWED_MIME,
  VIDEO_ALLOWED_MIME,
};
