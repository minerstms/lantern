/**
 * Prompt #250 — authoritative per-object authorization for student/school media
 * delivered through GET /api/news/image and GET /api/news/video.
 *
 * Authentication alone is not enough. The viewer must be allowed to receive
 * THIS object key based on the content row(s) that reference it.
 *
 * Future thumbnail endpoints must call authorizeNewsMediaDelivery — do not
 * invent a weaker parallel check.
 *
 * Does not write D1 or R2. Does not delete orphan objects.
 */
import {
  accountOwnsFeedItem,
  accountOwnsMissionSubmission,
  accountOwnsNewsRow,
  accountOwnsPollRow,
} from './content-author-remove.js';
import { isTeacherLike } from './missions-auth.js';

export const NEWS_MEDIA_NOT_FOUND = { ok: false, status: 404, error: 'not_found' };

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

export function isHiddenAt(row) {
  return !!(row && trimStr(row.hidden_at));
}

export function isMissionCardObjectKey(raw) {
  const key = trimStr(raw);
  return key.startsWith('missions/card/') && key !== 'missions/card/';
}

export function isReviewStaffAccount(account) {
  return !!(account && isTeacherLike(account.role));
}

/**
 * True when a URL/JSON blob actually references this exact object key
 * (not a longer key that merely shares a prefix).
 */
export function contentReferencesObjectKey(content, key) {
  const s = content == null ? '' : String(content);
  const k = trimStr(key);
  if (!s || !k) return false;
  const needles = ['key=' + encodeURIComponent(k), 'key=' + k, '"' + k + '"', "'" + k + "'", k];
  for (let n = 0; n < needles.length; n++) {
    const needle = needles[n];
    let from = 0;
    while (from <= s.length) {
      const idx = s.indexOf(needle, from);
      if (idx < 0) break;
      const after = s.charAt(idx + needle.length);
      if (!after || /[^A-Za-z0-9._-]/.test(after)) return true;
      from = idx + needle.length;
    }
  }
  return false;
}

function statusOf(row) {
  return trimStr(row && row.status).toLowerCase();
}

function hasApprovedAt(row) {
  return !!trimStr(row && row.approved_at);
}

function newsIsExplorePublic(row) {
  return statusOf(row) === 'approved' && !isHiddenAt(row);
}

function feedIsExplorePublic(row) {
  return statusOf(row) === 'approved' && !isHiddenAt(row);
}

function missionIsExplorePublic(row) {
  return statusOf(row) === 'accepted' && !isHiddenAt(row);
}

function pollIsExplorePublic(row) {
  return hasApprovedAt(row) && !isHiddenAt(row);
}

function contributionIsExplorePublic(row) {
  return statusOf(row) === 'approved' && !isHiddenAt(row);
}

function triviaIsExplorePublic(row) {
  return statusOf(row) === 'approved' && Number(row && row.live) === 1 && !isHiddenAt(row);
}

async function safeAll(stmt) {
  try {
    const res = await stmt;
    return (res && res.results) || [];
  } catch (_) {
    return [];
  }
}

function pushRows(refs, source, rows, extra) {
  for (let i = 0; i < rows.length; i++) {
    refs.push(Object.assign({ source: source, row: rows[i] }, extra || {}));
  }
}

/**
 * Every current DB row that owns or references this exact news-delivery key.
 */
export async function findNewsMediaReferences(db, key) {
  const k = trimStr(key);
  if (!db || !k) return [];
  const encoded = encodeURIComponent(k);
  const refs = [];

  const [news, feed, recognition, missionCards, missionSubs, polls, contribs, trivia] = await Promise.all([
    safeAll(
      db
        .prepare(
          'SELECT id, status, hidden_at, actor_id, author_name, author_type FROM lantern_news_submissions WHERE image_r2_key = ? OR full_image_r2_key = ? OR video_r2_key = ?'
        )
        .bind(k, k, k)
        .all()
    ),
    safeAll(
      db
        .prepare(
          'SELECT id, status, hidden_at, author_id, author_display_name FROM lantern_feed_items WHERE image_r2_key = ? OR video_r2_key = ?'
        )
        .bind(k, k)
        .all()
    ),
    safeAll(
      db
        .prepare(
          'SELECT id, character_name FROM lantern_teacher_recognition WHERE image_r2_key = ? OR full_image_r2_key = ? OR video_r2_key = ?'
        )
        .bind(k, k, k)
        .all()
    ),
    safeAll(
      db
        .prepare('SELECT id, card_image_r2_key FROM lantern_missions WHERE card_image_r2_key = ?')
        .bind(k)
        .all()
    ),
    safeAll(
      db
        .prepare(
          'SELECT id, character_name, status, hidden_at, submission_content FROM lantern_mission_submissions WHERE instr(submission_content, ?) > 0 OR instr(submission_content, ?) > 0'
        )
        .bind(k, encoded)
        .all()
    ),
    safeAll(
      db
        .prepare(
          'SELECT id, character_name, created_by_character, approved_at, hidden_at, image_url FROM lantern_polls WHERE instr(image_url, ?) > 0 OR instr(image_url, ?) > 0'
        )
        .bind(k, encoded)
        .all()
    ),
    safeAll(
      db
        .prepare(
          'SELECT id, character_name, status, image_url FROM lantern_poll_contributions WHERE instr(image_url, ?) > 0 OR instr(image_url, ?) > 0'
        )
        .bind(k, encoded)
        .all()
    ),
    safeAll(
      db
        .prepare(
          'SELECT id, status, live, hidden_at, author_id, author_display_name FROM lantern_trivia_questions WHERE image_r2_key = ?'
        )
        .bind(k)
        .all()
    ),
  ]);

  pushRows(refs, 'news', news);
  pushRows(refs, 'feed', feed);
  pushRows(refs, 'recognition', recognition);
  pushRows(refs, 'mission_card', missionCards);
  pushRows(
    refs,
    'mission_submission',
    missionSubs.filter((row) => contentReferencesObjectKey(row.submission_content, k))
  );
  pushRows(
    refs,
    'poll',
    polls.filter((row) => contentReferencesObjectKey(row.image_url, k))
  );
  pushRows(
    refs,
    'poll_contribution',
    contribs.filter((row) => contentReferencesObjectKey(row.image_url, k))
  );
  pushRows(refs, 'trivia', trivia);
  return refs;
}

function ownsRef(account, ref, pilotEconomyCharacterName) {
  const row = ref && ref.row;
  if (!account || !row) return false;
  switch (ref.source) {
    case 'news':
      return accountOwnsNewsRow(account, row, pilotEconomyCharacterName);
    case 'feed':
      return accountOwnsFeedItem(account, row, pilotEconomyCharacterName);
    case 'mission_submission':
      return accountOwnsMissionSubmission(account, row, pilotEconomyCharacterName);
    case 'poll':
    case 'poll_contribution':
      return accountOwnsPollRow(account, row, pilotEconomyCharacterName);
    case 'trivia':
      return accountOwnsFeedItem(
        account,
        { author_id: row.author_id, author_display_name: row.author_display_name },
        pilotEconomyCharacterName
      );
    case 'recognition':
    case 'mission_card':
      return false;
    default:
      return false;
  }
}

function refIsExplorePublic(ref) {
  const row = ref && ref.row;
  if (!row) return false;
  switch (ref.source) {
    case 'news':
      return newsIsExplorePublic(row);
    case 'feed':
      return feedIsExplorePublic(row);
    case 'mission_submission':
      return missionIsExplorePublic(row);
    case 'poll':
      return pollIsExplorePublic(row);
    case 'poll_contribution':
      return contributionIsExplorePublic(row);
    case 'trivia':
      return triviaIsExplorePublic(row);
    case 'recognition':
    case 'mission_card':
      return true;
    default:
      return false;
  }
}

/**
 * Allow if ANY referencing row grants the viewer access.
 * Approved Explore / recognition / mission-card art → any authenticated account.
 * Pending / returned / rejected / withdrawn / hidden → owner or teacher/admin.
 */
export function viewerMayReceiveNewsMedia(account, refs, pilotEconomyCharacterName) {
  if (!account || !Array.isArray(refs) || !refs.length) return false;
  if (isReviewStaffAccount(account)) return true;
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    if (refIsExplorePublic(ref)) return true;
    if (ownsRef(account, ref, pilotEconomyCharacterName)) return true;
  }
  return false;
}

/**
 * Authoritative delivery gate. Caller must already:
 *   - validate the key namespace (isNewsDeliveryObjectKey / isNewsImageObjectKey / isNewsVideoObjectKey)
 *   - authenticate the viewer
 *   - reject must-change-password
 *
 * Unauthorized and orphan keys both return 404 so the API does not disclose
 * that student media exists.
 *
 * Unreferenced missions/card/ keys: teacher/admin only (Studio create-preview
 * before the mission row is saved). All other orphans fail closed for everyone.
 */
export async function authorizeNewsMediaDelivery(db, account, key, opts) {
  if (!account) return NEWS_MEDIA_NOT_FOUND;
  const k = trimStr(key);
  if (!k) return NEWS_MEDIA_NOT_FOUND;
  const refs = await findNewsMediaReferences(db, k);
  if (!refs.length) {
    if (isMissionCardObjectKey(k) && isReviewStaffAccount(account)) {
      return { ok: true, reason: 'staff_unreferenced_mission_card' };
    }
    return NEWS_MEDIA_NOT_FOUND;
  }
  if (viewerMayReceiveNewsMedia(account, refs, opts && opts.pilotEconomyCharacterName)) {
    return { ok: true, refs: refs };
  }
  return NEWS_MEDIA_NOT_FOUND;
}
