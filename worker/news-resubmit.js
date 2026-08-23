/**
 * Prompt #254A — owner-only News / Shout-Out resubmit with explicit media intent.
 * Replacement media is uploaded inside this handler. Client R2 keys are rejected.
 */

import { accountOwnsNewsRow } from './content-author-remove.js';
import {
  listContentPeople,
  normalizePeoplePayload,
  normalizeShoutOutRecognition,
  replaceContentPeople,
} from './content-people.js';
import { clearSidecarForSource, touchSidecarForOriginal } from './image-thumbnails.js';
import { putNewsImageBytes, putNewsVideoBytes } from './news-media-upload.js';

const FORBIDDEN_IDENTITY_KEYS = [
  'character_name',
  'username',
  'account_id',
  'student_id',
  'teacher_id',
  'author_name',
  'actor_id',
  'target',
  'simStudent',
  'economy_key',
];

const FORBIDDEN_CLIENT_KEYS = ['image_r2_key', 'full_image_r2_key', 'video_r2_key'];

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function isStudentAccount(account) {
  return trimStr(account && account.role).toLowerCase() === 'student';
}

function isShoutOutCategory(category) {
  return trimStr(category).toLowerCase() === 'student spotlight';
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

function normalizeLinkUrl(raw) {
  let linkUrl = trimStr(raw);
  if (!linkUrl) return null;
  if (!/^https?:\/\//i.test(linkUrl)) return null;
  return linkUrl.slice(0, 2000);
}

function peopleTokenFromRow(row) {
  const kind = trimStr(row && row.person_kind).toLowerCase();
  const key = trimStr(row && row.person_key);
  if (!key) return '';
  if (kind === 'student') return 'student:' + key;
  if (key.indexOf('lantern_staff:') === 0) return 'staff_lantern:' + key.slice('lantern_staff:'.length);
  if (kind === 'staff') return key.indexOf('staff_tms:') === 0 ? key : 'staff_tms:' + key;
  return '';
}

function publicPeople(rows) {
  return (rows || [])
    .map((r) => ({
      token: peopleTokenFromRow(r),
      relationship: r.relationship || 'tagged',
      person_kind: r.person_kind,
      person_key: r.person_key,
      label: r.display_label || '',
    }))
    .filter((p) => p.token || p.label);
}

function recognitionLabelFromBody(body) {
  const m = String(body || '').match(/^Recognizing:\s*(.+)$/im);
  return m ? String(m[1] || '').trim() : '';
}

export function newsRevisionPayload(row, origin, peopleRows) {
  const imageKey = trimStr(row && row.image_r2_key);
  const fullKey = trimStr(row && row.full_image_r2_key);
  const videoKey = trimStr(row && row.video_r2_key);
  const linkUrl = normalizeLinkUrl(row && row.link_url);
  const originBase = trimStr(origin);
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    category: row.category != null && trimStr(row.category) !== '' ? trimStr(row.category) : null,
    status: row.status,
    photo_credit: row.photo_credit || '',
    decision_note: row.decision_note || '',
    image_r2_key: imageKey || null,
    full_image_r2_key: fullKey || null,
    video_r2_key: videoKey || null,
    image_url: imageKey ? originBase + '/api/news/image?key=' + encodeURIComponent(imageKey) : null,
    full_image_url: fullKey ? originBase + '/api/news/image?key=' + encodeURIComponent(fullKey) : null,
    video_url: videoKey ? originBase + '/api/news/video?key=' + encodeURIComponent(videoKey) : null,
    link_url: linkUrl,
    people: publicPeople(peopleRows),
    recognition_label: isShoutOutCategory(row.category) ? recognitionLabelFromBody(row.body) : '',
    contribute_type: isShoutOutCategory(row.category) ? 'shoutout' : 'post',
  };
}

function emptyImageFields() {
  return {
    image_r2_key: null,
    full_image_r2_key: null,
    image_file_name: null,
    image_mime_type: null,
    image_file_size: null,
  };
}

function emptyVideoFields() {
  return {
    video_r2_key: null,
    video_file_name: null,
    video_mime_type: null,
    video_file_size: null,
  };
}

async function requireStudentOwner(request, env, cors, ctx, row) {
  const account = await ctx.getPilotAccountFromRequest(request, env);
  if (!account) {
    return { error: ctx.jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors) };
  }
  if (ctx.pilotAccountRequiresChangePassword(account)) {
    return {
      error: ctx.jsonResponse(
        { ok: false, error: 'must_change_password', redirect: '/change-password.html' },
        403,
        cors
      ),
    };
  }
  if (!isStudentAccount(account)) {
    return { error: ctx.jsonResponse({ ok: false, error: 'student_owner_required' }, 403, cors) };
  }
  if (!accountOwnsNewsRow(account, row, ctx.pilotEconomyCharacterName)) {
    return { error: ctx.jsonResponse({ ok: false, error: 'forbidden' }, 403, cors) };
  }
  return { account };
}

export async function handleNewsRevisionGet(request, url, path, env, cors, ctx) {
  const id = decodeURIComponent(path.slice('/api/news/revision/'.length).split('/')[0] || '').trim();
  if (!id) return ctx.jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
  const rejected = ['character_name', 'username', 'student_id', 'author_name', 'target', 'simStudent'].find(
    (k) => url.searchParams.get(k)
  );
  if (rejected) {
    return ctx.jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: rejected }, 400, cors);
  }
  const db = env.DB;
  const row = await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(id).first();
  if (!row) return ctx.jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
  const auth = await requireStudentOwner(request, env, cors, ctx, row);
  if (auth.error) return auth.error;
  if (trimStr(row.status) !== 'returned') {
    return ctx.jsonResponse({ ok: false, error: 'Can only load returned articles' }, 400, cors);
  }
  let peopleRows = [];
  try {
    peopleRows = await listContentPeople(db, 'news', id);
  } catch (_) {
    peopleRows = [];
  }
  return ctx.jsonResponse(
    { ok: true, item: newsRevisionPayload(row, url.origin || '', peopleRows) },
    200,
    cors
  );
}

export async function handleNewsResubmit(request, env, cors, ctx) {
  const db = env.DB;
  const bucket = env.NEWS_BUCKET || env.AVATAR_BUCKET;
  const text = await request.text();
  let body;
  try {
    body = JSON.parse(text || '{}');
  } catch (_) {
    return ctx.jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
  }
  const identityKey = firstForbiddenKey(body, FORBIDDEN_IDENTITY_KEYS);
  if (identityKey) {
    return ctx.jsonResponse({ ok: false, error: 'identity_params_not_allowed', param: identityKey }, 400, cors);
  }
  const clientKey = firstForbiddenKey(body, FORBIDDEN_CLIENT_KEYS);
  if (clientKey) {
    return ctx.jsonResponse({ ok: false, error: 'client_media_key_not_allowed', param: clientKey }, 400, cors);
  }

  const id = trimStr(body.id);
  if (!id) return ctx.jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
  const prior = await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(id).first();
  if (!prior) return ctx.jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
  if (trimStr(prior.status) !== 'returned') {
    return ctx.jsonResponse({ ok: false, error: 'Can only resubmit returned articles' }, 400, cors);
  }

  const auth = await requireStudentOwner(request, env, cors, ctx, prior);
  if (auth.error) return auth.error;
  const account = auth.account;

  const title = trimStr(body.title);
  const articleBody = trimStr(body.body);
  if (!title || !articleBody) {
    return ctx.jsonResponse({ ok: false, error: 'Missing title or body' }, 400, cors);
  }

  let categoryNext =
    prior.category != null && trimStr(prior.category) !== '' ? trimStr(prior.category).slice(0, 200) : null;
  if (Object.prototype.hasOwnProperty.call(body, 'category')) {
    categoryNext = trimStr(body.category).slice(0, 200) || null;
  }
  const shout = isShoutOutCategory(categoryNext);

  let mediaAction = trimStr(body.media_action).toLowerCase();
  if (!mediaAction) mediaAction = 'keep';
  if (mediaAction !== 'keep' && mediaAction !== 'replace' && mediaAction !== 'remove') {
    return ctx.jsonResponse({ ok: false, error: 'invalid_media_action' }, 400, cors);
  }

  const next = {
    image_r2_key: prior.image_r2_key || null,
    full_image_r2_key: prior.full_image_r2_key || null,
    image_file_name: prior.image_file_name || null,
    image_mime_type: prior.image_mime_type || null,
    image_file_size: prior.image_file_size != null ? prior.image_file_size : null,
    video_r2_key: prior.video_r2_key || null,
    video_file_name: prior.video_file_name || null,
    video_mime_type: prior.video_mime_type || null,
    video_file_size: prior.video_file_size != null ? prior.video_file_size : null,
    link_url: prior.link_url || null,
    photo_credit: prior.photo_credit || null,
  };

  let sidecarTouchKey = null;
  let sidecarClear = false;
  let imageVersionUnchanged = true;

  if (mediaAction === 'keep') {
    if (Object.prototype.hasOwnProperty.call(body, 'photo_credit')) {
      next.photo_credit = trimStr(body.photo_credit) || null;
    }
  } else if (mediaAction === 'remove') {
    Object.assign(next, emptyImageFields(), emptyVideoFields(), { link_url: null, photo_credit: null });
    sidecarClear = true;
  } else {
    const kind = trimStr(body.media_kind).toLowerCase();
    if (kind !== 'image' && kind !== 'video' && kind !== 'link') {
      return ctx.jsonResponse({ ok: false, error: 'invalid_media_kind' }, 400, cors);
    }
    if (kind === 'image') {
      const uploaded = await putNewsImageBytes(bucket, {
        image: body.image,
        mime_type: body.mime_type,
        file_name: body.file_name || 'image.png',
      });
      if (!uploaded.ok) return ctx.jsonResponse({ ok: false, error: uploaded.error }, uploaded.status || 400, cors);
      let full = null;
      if (body.full_image) {
        full = await putNewsImageBytes(bucket, {
          image: body.full_image,
          mime_type: body.full_mime_type || body.mime_type,
          file_name: body.full_file_name || 'full.png',
        });
        if (!full.ok) return ctx.jsonResponse({ ok: false, error: full.error }, full.status || 400, cors);
      }
      Object.assign(next, emptyVideoFields(), {
        image_r2_key: uploaded.image_r2_key,
        full_image_r2_key: full ? full.image_r2_key : null,
        image_file_name: uploaded.image_file_name,
        image_mime_type: uploaded.image_mime_type,
        image_file_size: uploaded.image_file_size,
        link_url: null,
        photo_credit: Object.prototype.hasOwnProperty.call(body, 'photo_credit')
          ? trimStr(body.photo_credit) || null
          : null,
      });
      sidecarTouchKey = uploaded.image_r2_key;
      imageVersionUnchanged = false;
    } else if (kind === 'video') {
      const uploaded = await putNewsVideoBytes(bucket, {
        video: body.video,
        mime_type: body.mime_type,
        file_name: body.file_name || 'video.mp4',
      });
      if (!uploaded.ok) return ctx.jsonResponse({ ok: false, error: uploaded.error }, uploaded.status || 400, cors);
      Object.assign(next, emptyImageFields(), {
        video_r2_key: uploaded.video_r2_key,
        video_file_name: uploaded.video_file_name,
        video_mime_type: uploaded.video_mime_type,
        video_file_size: uploaded.video_file_size,
        link_url: null,
        photo_credit: null,
      });
      sidecarClear = true;
    } else {
      const linkUrl = normalizeLinkUrl(body.link_url);
      if (!linkUrl) return ctx.jsonResponse({ ok: false, error: 'Invalid link_url' }, 400, cors);
      Object.assign(next, emptyImageFields(), emptyVideoFields(), { link_url: linkUrl, photo_credit: null });
      sidecarClear = true;
    }
  }

  let articleBodyFinal = articleBody;
  let peopleNorm;
  const peopleFieldPresent = Object.prototype.hasOwnProperty.call(body, 'people');
  const recognitionFieldPresent = Object.prototype.hasOwnProperty.call(body, 'recognition_label');
  if (peopleFieldPresent && body.people != null && !Array.isArray(body.people)) {
    return ctx.jsonResponse({ ok: false, error: 'Invalid people' }, 400, cors);
  }
  if (shout) {
    const shoutPeopleEdit = peopleFieldPresent || recognitionFieldPresent;
    if (shoutPeopleEdit) {
      const shoutRec = await normalizeShoutOutRecognition(
        db,
        peopleFieldPresent ? body.people : [],
        recognitionFieldPresent ? body.recognition_label : ''
      );
      if (!shoutRec.ok) return ctx.jsonResponse({ ok: false, error: shoutRec.error }, 400, cors);
      peopleNorm = { ok: true, people: shoutRec.people };
      if (shoutRec.recognition_label && !/^Recognizing:\s*/i.test(articleBodyFinal)) {
        articleBodyFinal = 'Recognizing: ' + shoutRec.recognition_label + '\n\n' + articleBodyFinal;
      }
    } else {
      const priorLabel = recognitionLabelFromBody(prior.body);
      if (priorLabel && !/^Recognizing:\s*/i.test(articleBodyFinal)) {
        articleBodyFinal = 'Recognizing: ' + priorLabel + '\n\n' + articleBodyFinal;
      }
    }
  } else if (peopleFieldPresent) {
    peopleNorm = await normalizePeoplePayload(db, body.people || [], { requireRecognizedOne: false });
    if (!peopleNorm.ok) return ctx.jsonResponse({ ok: false, error: peopleNorm.error }, 400, cors);
  }

  const now = new Date().toISOString();
  try {
    await ctx.recordEventForAccount(db, account, {
      itemType: 'news',
      itemId: id,
      eventType: 'resubmitted',
      snapshot: ctx.snapshotFromNews(
        Object.assign({}, prior, {
          title,
          body: articleBodyFinal,
          category: categoryNext,
          status: 'pending',
          image_r2_key: next.image_r2_key,
          full_image_r2_key: next.full_image_r2_key,
          video_r2_key: next.video_r2_key,
        })
      ),
      now,
    });
  } catch (err) {
    if (ctx.isModerationSchemaError(err)) return ctx.schemaErrorResponse(ctx.jsonResponse, cors);
    throw err;
  }

  await db
    .prepare(
      `UPDATE lantern_news_submissions SET
        title = ?, body = ?, category = ?,
        image_r2_key = ?, full_image_r2_key = ?, image_file_name = ?, image_mime_type = ?, image_file_size = ?,
        photo_credit = ?,
        video_r2_key = ?, video_file_name = ?, video_mime_type = ?, video_file_size = ?,
        link_url = ?,
        status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ?
      WHERE id = ? AND status = ?`
    )
    .bind(
      title,
      articleBodyFinal,
      categoryNext,
      next.image_r2_key,
      next.full_image_r2_key,
      next.image_file_name,
      next.image_mime_type,
      next.image_file_size,
      next.photo_credit,
      next.video_r2_key,
      next.video_file_name,
      next.video_mime_type,
      next.video_file_size,
      next.link_url,
      'pending',
      null,
      null,
      null,
      null,
      id,
      'returned'
    )
    .run();

  if (peopleNorm) {
    try {
      await replaceContentPeople(db, 'news', id, peopleNorm.people, account.username);
    } catch (_) {
      return ctx.jsonResponse({ ok: false, error: 'people_schema_required' }, 503, cors);
    }
  }

  if (sidecarTouchKey) {
    try {
      await touchSidecarForOriginal(db, 'news', id, sidecarTouchKey);
    } catch (_) {}
  } else if (sidecarClear) {
    try {
      await clearSidecarForSource(db, 'news', id);
    } catch (_) {}
  }

  const approvalRow = await db
    .prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?')
    .bind('news', id)
    .first();
  if (approvalRow) {
    await db
      .prepare(
        'UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ?, assigned_to_staff_id = ?, assigned_to_staff_name = ? WHERE id = ?'
      )
      .bind('pending', null, null, null, null, null, null, approvalRow.id)
      .run();
  }

  return ctx.jsonResponse(
    {
      ok: true,
      id,
      status: 'pending',
      media_action: mediaAction,
      image_r2_key: next.image_r2_key,
      video_r2_key: next.video_r2_key,
      link_url: next.link_url,
      photo_credit: next.photo_credit,
      keep_thumbnail: mediaAction === 'keep' && imageVersionUnchanged,
    },
    200,
    cors
  );
}

export const newsResubmitTest = {
  FORBIDDEN_IDENTITY_KEYS,
  FORBIDDEN_CLIENT_KEYS,
  isShoutOutCategory,
  firstForbiddenKey,
};
