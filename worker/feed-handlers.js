/**
 * Lantern ONE FEED — Worker handlers
 * ONE normalized public feed API + student/teacher moderation workflow.
 */
import { extractMissionSubmissionMedia } from './missions-auth.js';
import { filterOutDemoPersonas } from './demo-persona-guard.js';
import { ensureContentApprovedMissionCompletion } from './mission-event-completions.js';
import { attachAuthorAvatarKeys, loadPilotAvatarKeyIndex } from './author-avatar-key.js';
import { attachAuthorPublicLabels, loadStaffPublicNameIndex } from './staff-public-name.js';

export const FEED_TYPES = {
  news: 'News',
  mission: 'Mission',
  poll: 'Poll',
  game_score: 'Game Score',
  leaderboard: 'Leaderboard',
  achievement: 'Achievement',
  shout_out: 'Shout-Out',
  photo: 'Photo',
  video: 'Video',
  article: 'Article',
  trivia: 'Trivia',
};

/** Explore filter bar order (Prompt #154). Game/system types remain in FEED_TYPES for data compatibility but are UI-archived. */
export const EXPLORE_FEED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'news', label: 'News' },
  { id: 'mission', label: 'Missions' },
  { id: 'poll', label: 'Polls' },
  { id: 'shout_out', label: 'Shout-Outs' },
  { id: 'photo', label: 'Photos' },
  { id: 'video', label: 'Videos' },
  { id: 'article', label: 'Articles' },
];

export const FEED_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'hidden'];

export const FEED_REACTION_TYPES = ['clap', 'star', 'celebrate', 'heart', 'fire', 'lightbulb'];

const TEACHER_ROLES = new Set(['teacher', 'staff', 'admin']);

function feedJson(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function normalizeRole(r) {
  return String(r || '').trim().toLowerCase();
}

function isTeacherLike(role) {
  return TEACHER_ROLES.has(normalizeRole(role));
}

function authorKeyFromAccount(account, pilotEconomyCharacterName) {
  if (!account) return '';
  const role = normalizeRole(account.role);
  if (role === 'student') {
    return pilotEconomyCharacterName(account) || String(account.student_character_name || account.username || '').trim();
  }
  return String(account.display_name || account.username || '').trim();
}

function parseTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch (_) {
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function newsImageUrl(origin, key) {
  if (!key) return null;
  return `${origin}/api/news/image?key=${encodeURIComponent(key)}`;
}

/**
 * Prompt #177 — peer Contribute Shout-Outs are stored as news rows without a type column.
 * Detect the same body/title signals used by recognition Spotlight merge so media never
 * reclassifies primary Explore type away from shout_out.
 */
export function isPeerShoutOutNewsSubmission(row) {
  if (!row) return false;
  const body = String(row.body || '');
  const title = String(row.title || '').trim();
  if (/^Shout-out\b/i.test(body.trim())) return true;
  if (/Recognizing:\s*/i.test(body)) return true;
  if (/^Shout-out:\s*/i.test(title)) return true;
  return false;
}

/**
 * Primary Explore type for news submissions.
 * Shout-Out identity wins over attached photo/video/link (Prompt #177).
 * Standalone media posts still classify as photo/video/article/news.
 */
export function inferNewsType(row) {
  if (isPeerShoutOutNewsSubmission(row)) return 'shout_out';
  if (row.video_r2_key) return 'video';
  if (row.image_r2_key) return 'photo';
  const cat = String(row.category || '').trim().toLowerCase();
  if (cat === 'news') return 'news';
  return 'article';
}

function normalizeFeedItemRow(row, origin, source) {
  const type = row.type || 'article';
  const typeLabel = FEED_TYPES[type] || type;
  const tags = parseTags(row.tags);
  let thumbnailUrl = null;
  let imageUrl = null;
  let videoUrl = null;
  if (row.image_r2_key) {
    thumbnailUrl = newsImageUrl(origin, row.image_r2_key);
    imageUrl = row.full_image_r2_key ? newsImageUrl(origin, row.full_image_r2_key) : thumbnailUrl;
  } else if (row.direct_image_url) {
    /* Already a complete URL (e.g. mission submission photo) — not an R2 key to resolve. */
    thumbnailUrl = row.direct_image_url;
    imageUrl = row.direct_image_url;
  } else if (row.video_r2_key) {
    thumbnailUrl = null;
  }
  if (row.video_r2_key) {
    videoUrl = `${origin}/api/news/video?key=${encodeURIComponent(row.video_r2_key)}`;
  } else if (row.videoUrl) {
    videoUrl = row.videoUrl;
  }
  return {
    id: row.id,
    source: source || 'feed',
    type,
    typeLabel,
    title: row.title || '',
    body: row.body || row.summary || '',
    summary: row.summary || (row.body ? String(row.body).slice(0, 280) : ''),
    authorId: row.author_id || row.authorId || null,
    authorDisplayName: row.author_display_name || row.author_name || row.authorDisplayName || 'Unknown',
    authorRole: row.author_role || row.author_type || row.authorRole || 'student',
    createdAt: row.created_at || row.createdAt || null,
    submittedAt: row.submitted_at || row.submittedAt || null,
    approvedAt: row.approved_at || row.reviewed_at || row.approvedAt || null,
    approvedBy: row.approved_by || row.reviewed_by_staff_name || row.approvedBy || null,
    status: String(row.status || 'approved').toLowerCase(),
    thumbnailUrl,
    imageUrl,
    videoUrl,
    detailUrl: null,
    tags,
    reactionCounts: {},
    myReactions: [],
    teacherComments: [],
    slideshowEligible: !!(row.slideshow_eligible || row.slideshowEligible),
    featuredEligible: !!(row.featured_eligible || row.featuredEligible),
    homeEligible: !!(row.home_eligible || row.homeEligible),
    contentSlot: row.extra_json ? (() => { try { return JSON.parse(row.extra_json); } catch (_) { return {}; } })() : (row.contentSlot || {}),
    privateFeedback: row.private_feedback || null,
  };
}

export function normalizeNewsRow(row, origin) {
  const type = inferNewsType(row);
  const adapted = {
    id: `news:${row.id}`,
    type,
    title: row.title,
    body: row.body,
    summary: row.body ? String(row.body).slice(0, 280) : '',
    author_id: row.actor_id,
    author_display_name: row.author_name,
    author_role: row.author_type || 'student',
    image_r2_key: row.image_r2_key,
    full_image_r2_key: row.full_image_r2_key,
    video_r2_key: row.video_r2_key,
    tags: row.category ? JSON.stringify([row.category]) : '[]',
    status: 'approved',
    slideshow_eligible: 0,
    featured_eligible: 0,
    home_eligible: 1,
    created_at: row.created_at,
    submitted_at: row.created_at,
    approved_at: row.reviewed_at || row.created_at,
    approved_by: null,
    extra_json: JSON.stringify({
      linkUrl: row.link_url || null,
      newsId: row.id,
      videoUrl: row.video_r2_key ? `${origin}/api/news/video?key=${encodeURIComponent(row.video_r2_key)}` : null,
    }),
  };
  const item = normalizeFeedItemRow(adapted, origin, 'news');
  return item;
}

function normalizeMissionRow(row, origin) {
  // Use the same media/caption extraction as the teacher and approved-submissions APIs so a
  // student's photo (plain image_url type, or a text-type { text, image_url } envelope) survives
  // into the public Explore feed instead of being silently dropped.
  const media = extractMissionSubmissionMedia(row.submission_type, row.submission_content);
  const bodyText = media.caption || (row.submission_type === 'video' || row.submission_type === 'image_url' ? '' : String(row.submission_content || '').trim().slice(0, 500));
  // Prompt #123 — visible Explore card title is the source mission title (via mission_id join),
  // never a hard-coded "Mission Submission" when the mission row still resolves.
  const missionTitle = String(row.mission_title || '').trim();
  // Prompt #210 — artwork priority: submission media → Mission Card Image → client mission fallback.
  const cardKey = row.card_image_r2_key != null ? String(row.card_image_r2_key).trim() : '';
  const missionCardUrl = cardKey
    ? `${String(origin || '').replace(/\/$/, '')}/api/news/image?key=${encodeURIComponent(cardKey)}`
    : null;
  const imageForCard = media.image_url || missionCardUrl || null;
  const adapted = {
    id: `mission:${row.id}`,
    type: 'mission',
    title: missionTitle || 'Mission Submission',
    body: bodyText,
    summary: bodyText ? bodyText.slice(0, 280) : (media.image_url ? 'Photo submission' : 'Mission completed'),
    author_id: null,
    author_display_name: row.character_name,
    author_role: 'student',
    direct_image_url: imageForCard,
    video_r2_key: null,
    tags: '[]',
    status: 'approved',
    slideshow_eligible: 0,
    featured_eligible: 0,
    home_eligible: 1,
    created_at: row.created_at,
    submitted_at: row.created_at,
    approved_at: row.reviewed_at || row.created_at,
    approved_by: row.reviewed_by || null,
    extra_json: JSON.stringify({
      missionId: row.mission_id,
      missionTitle: missionTitle || null,
      submissionType: row.submission_type,
      videoUrl: media.video_url || null,
      usedMissionCardImage: !media.image_url && !!missionCardUrl,
      cardImageR2Key: cardKey || null,
    }),
  };
  return normalizeFeedItemRow(adapted, origin, 'mission');
}

export function normalizePollRow(row, origin) {
  let choices = [];
  try {
    choices = JSON.parse(row.choices_json || '[]');
  } catch (_) {
    choices = [];
  }
  if (!Array.isArray(choices)) choices = [];
  const question = String(row.question || '').trim() || 'Poll';
  // Prompt #215 — do NOT flatten MC choices into body/summary (Explore was showing them as
  // paragraph text and opening the generic content modal). Choices live in contentSlot only.
  const adapted = {
    id: `poll:${row.id}`,
    type: 'poll',
    title: question,
    body: '',
    summary: 'Tap to vote',
    author_id: null,
    author_display_name: row.character_name || 'Poll',
    author_role: 'student',
    direct_image_url: row.image_url || null,
    tags: '[]',
    status: 'approved',
    slideshow_eligible: 0,
    featured_eligible: 0,
    home_eligible: 1,
    created_at: row.created_at,
    submitted_at: row.created_at,
    approved_at: row.approved_at || row.created_at,
    approved_by: null,
    extra_json: JSON.stringify({
      pollId: row.id,
      choices: choices,
      imageUrl: row.image_url || null,
    }),
  };
  return normalizeFeedItemRow(adapted, origin, 'poll');
}

export function normalizeShoutOutRow(row, origin) {
  const recipient = String(row.character_name || '').trim();
  const message = String(row.message || '').trim();
  const linkUrl = String(row.link_url || '').trim() || null;
  const videoKey = String(row.video_r2_key || '').trim() || null;
  const adapted = {
    id: `shout_out:${row.id}`,
    type: 'shout_out',
    title: message || 'Shout-Out!',
    body: recipient ? 'For ' + recipient : message,
    summary: message ? message.slice(0, 280) : 'Shout-Out!',
    author_id: row.created_by_teacher_id || null,
    author_display_name: row.created_by_teacher_name || 'Staff',
    author_role: 'teacher',
    image_r2_key: row.image_r2_key || null,
    full_image_r2_key: row.full_image_r2_key || null,
    video_r2_key: videoKey,
    tags: row.category ? JSON.stringify([row.category]) : '[]',
    status: 'approved',
    slideshow_eligible: 0,
    featured_eligible: 0,
    home_eligible: 1,
    created_at: row.created_at,
    submitted_at: row.created_at,
    approved_at: row.created_at,
    approved_by: row.created_by_teacher_name || null,
    extra_json: JSON.stringify({
      recipient: recipient || null,
      recognitionId: row.id,
      category: row.category || null,
      linkUrl: linkUrl,
      videoUrl: videoKey && origin ? `${origin}/api/news/video?key=${encodeURIComponent(videoKey)}` : null,
    }),
  };
  return normalizeFeedItemRow(adapted, origin || '', 'shout_out');
}

async function fetchApprovedFeedItems(db, origin) {
  const rows = await db.prepare(
    "SELECT * FROM lantern_feed_items WHERE LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '') ORDER BY approved_at DESC, created_at DESC"
  ).all();
  return (rows.results || []).map((r) => normalizeFeedItemRow(r, origin, 'feed'));
}

async function fetchApprovedNews(db, origin) {
  const rows = await db.prepare(
    "SELECT id, title, body, actor_id, author_name, author_type, image_r2_key, full_image_r2_key, video_r2_key, link_url, category, created_at, reviewed_at FROM lantern_news_submissions WHERE LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '') ORDER BY reviewed_at DESC, created_at DESC"
  ).all();
  return (rows.results || []).map((r) => normalizeNewsRow(r, origin));
}

async function fetchApprovedMissions(db, origin, limit) {
  const lim = Math.min(200, Math.max(1, limit || 100));
  const rows = await db.prepare(
    "SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by FROM lantern_mission_submissions WHERE LOWER(TRIM(status)) = 'accepted' AND (hidden_at IS NULL OR hidden_at = '') ORDER BY reviewed_at DESC, created_at DESC LIMIT ?"
  ).bind(lim).all();
  const results = rows.results || [];
  // Same authoritative join used by teacher/approved-submission APIs: mission_id → lantern_missions.title.
  const missionIds = [...new Set(results.map((r) => r.mission_id).filter(Boolean))];
  const byMission = {};
  if (missionIds.length > 0) {
    const placeholders = missionIds.map(() => '?').join(',');
    let mRows;
    try {
      mRows = await db
        .prepare('SELECT id, title, card_image_r2_key FROM lantern_missions WHERE id IN (' + placeholders + ')')
        .bind(...missionIds)
        .all();
    } catch (_) {
      mRows = await db
        .prepare('SELECT id, title FROM lantern_missions WHERE id IN (' + placeholders + ')')
        .bind(...missionIds)
        .all();
    }
    (mRows.results || []).forEach((m) => {
      byMission[m.id] = {
        title: String(m.title || '').trim(),
        card_image_r2_key: m.card_image_r2_key != null ? String(m.card_image_r2_key).trim() : '',
      };
    });
  }
  return results.map((r) => {
    const meta = byMission[r.mission_id] || { title: '', card_image_r2_key: '' };
    return normalizeMissionRow(
      Object.assign({}, r, {
        mission_title: meta.title || '',
        card_image_r2_key: meta.card_image_r2_key || '',
      }),
      origin
    );
  });
}

async function fetchApprovedPolls(db, origin, limit) {
  const lim = Math.min(100, Math.max(1, limit || 50));
  let rows;
  try {
    // Prompt #213 — exclude hidden polls (hidden_at) while keeping rows + votes recoverable.
    rows = await db
      .prepare(
        "SELECT id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL AND (hidden_at IS NULL OR hidden_at = '') ORDER BY approved_at DESC LIMIT ?"
      )
      .bind(lim)
      .all();
  } catch (_) {
    try {
      rows = await db
        .prepare(
          'SELECT id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT ?'
        )
        .bind(lim)
        .all();
    } catch (__) {
      rows = await db
        .prepare(
          'SELECT id, mission_submission_id, question, choices_json, character_name, created_at, approved_at FROM lantern_polls WHERE approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT ?'
        )
        .bind(lim)
        .all();
    }
  }
  return filterOutDemoPersonas(rows.results || [], 'character_name').map((r) => normalizePollRow(r, origin));
}

async function fetchApprovedShoutOuts(db, origin, limit) {
  const lim = Math.min(100, Math.max(1, limit || 50));
  let rows;
  try {
    rows = await db
      .prepare(
        'SELECT id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name, image_r2_key, full_image_r2_key, video_r2_key, link_url FROM lantern_teacher_recognition ORDER BY created_at DESC LIMIT ?'
      )
      .bind(lim)
      .all();
  } catch (_) {
    /* Pre-migration 061 rows without media columns. */
    rows = await db
      .prepare(
        'SELECT id, character_name, message, category, created_at, created_by_teacher_id, created_by_teacher_name FROM lantern_teacher_recognition ORDER BY created_at DESC LIMIT ?'
      )
      .bind(lim)
      .all();
  }
  // Filter demo recipients (author is staff; persona guard on authorDisplayName would miss this).
  return filterOutDemoPersonas(rows.results || [], 'character_name').map((r) => normalizeShoutOutRow(r, origin));
}

export async function collectApprovedFeed(db, origin, opts) {
  const limit = opts && opts.limit ? opts.limit : 200;
  const [feedItems, newsItems, missionItems, pollItems, shoutItems, avatarIndex, staffNameIndex] = await Promise.all([
    fetchApprovedFeedItems(db, origin),
    fetchApprovedNews(db, origin),
    fetchApprovedMissions(db, origin, limit),
    fetchApprovedPolls(db, origin, limit),
    fetchApprovedShoutOuts(db, origin, limit),
    loadPilotAvatarKeyIndex(db),
    loadStaffPublicNameIndex(db),
  ]);
  // Prompt #97: known demo/fake personas (created while building the app) have real, approved
  // rows in production across feed sources here — filter them from this unified public
  // Explore feed rather than deleting the historical rows. See worker/demo-persona-guard.js.
  const items = filterOutDemoPersonas(
    [...feedItems, ...newsItems, ...missionItems, ...pollItems, ...shoutItems],
    'authorDisplayName'
  );
  // Prompt #218 — attach Locker avatar profile keys (username / student economy id), not display labels.
  attachAuthorAvatarKeys(items, avatarIndex);
  // Prompt #220 — staff public author labels (Honorific + Last Name when configured).
  attachAuthorPublicLabels(items, staffNameIndex);
  return items;
}

export function filterFeedItems(items, params) {
  let out = items.slice();
  const typeFilter = (params.type || 'all').trim().toLowerCase();
  if (typeFilter && typeFilter !== 'all') {
    const map = {
      missions: 'mission',
      polls: 'poll',
      poll: 'poll',
      'game scores': 'game_score',
      game_scores: 'game_score',
      leaderboards: 'leaderboard',
      achievements: 'achievement',
      'shout-outs': 'shout_out',
      shout_outs: 'shout_out',
      shoutouts: 'shout_out',
      photos: 'photo',
      videos: 'video',
      articles: 'article',
      trivia: 'trivia',
      news: 'news',
    };
    const t = map[typeFilter] || typeFilter.replace(/-/g, '_');
    // Prompt #154 — each visible filter maps to its own canonical type (News ≠ Articles).
    out = out.filter((it) => it.type === t);
  }
  const search = (params.search || '').trim().toLowerCase();
  if (search) {
    out = out.filter((it) => {
      const hay = [it.title, it.body, it.summary, it.authorDisplayName, ...(it.tags || [])].join(' ').toLowerCase();
      return hay.includes(search);
    });
  }
  const sort = (params.sort || 'newest').trim().toLowerCase();
  if (sort === 'oldest') {
    out.sort((a, b) => String(a.approvedAt || a.createdAt).localeCompare(String(b.approvedAt || b.createdAt)));
  } else if (sort === 'title') {
    out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  } else {
    out.sort((a, b) => String(b.approvedAt || b.createdAt).localeCompare(String(a.approvedAt || a.createdAt)));
  }
  const featured = params.featured === '1' || params.featured === 'true';
  if (featured) out = out.filter((it) => it.featuredEligible);
  const slideshow = params.slideshow === '1' || params.slideshow === 'true';
  if (slideshow) out = out.filter((it) => it.slideshowEligible);
  const lim = Math.min(100, Math.max(1, parseInt(params.limit || '50', 10)));
  return out.slice(0, lim);
}

export async function attachReactionsAndComments(db, items, viewerCharacterName) {
  if (!items.length) return items;
  const ids = items.map((it) => it.id);
  const placeholders = ids.map(() => '?').join(',');
  const countRows = await db.prepare(
    `SELECT item_id, reaction_type, COUNT(*) AS c FROM lantern_reactions WHERE item_type = 'feed' AND item_id IN (${placeholders}) GROUP BY item_id, reaction_type`
  ).bind(...ids).all();
  const mineRows = viewerCharacterName
    ? await db.prepare(
        `SELECT item_id, reaction_type FROM lantern_reactions WHERE item_type = 'feed' AND item_id IN (${placeholders}) AND character_name = ?`
      ).bind(...ids, viewerCharacterName).all()
    : { results: [] };
  const feedIds = items.filter((it) => it.source === 'feed').map((it) => it.id);
  let commentRows = { results: [] };
  if (feedIds.length) {
    const cp = feedIds.map(() => '?').join(',');
    commentRows = await db.prepare(
      `SELECT id, feed_item_id, author_display_name, author_role, body, created_at FROM lantern_feed_comments WHERE feed_item_id IN (${cp}) ORDER BY created_at ASC`
    ).bind(...feedIds).all();
  }
  const countsById = {};
  ids.forEach((id) => { countsById[id] = {}; });
  (countRows.results || []).forEach((r) => {
    if (countsById[r.item_id]) countsById[r.item_id][r.reaction_type] = r.c;
  });
  const mineById = {};
  ids.forEach((id) => { mineById[id] = []; });
  (mineRows.results || []).forEach((r) => {
    if (mineById[r.item_id] && !mineById[r.item_id].includes(r.reaction_type)) mineById[r.item_id].push(r.reaction_type);
  });
  const commentsById = {};
  (commentRows.results || []).forEach((r) => {
    if (!commentsById[r.feed_item_id]) commentsById[r.feed_item_id] = [];
    commentsById[r.feed_item_id].push({
      id: r.id,
      authorDisplayName: r.author_display_name,
      authorRole: r.author_role,
      body: r.body,
      createdAt: r.created_at,
      isTeacherComment: true,
    });
  });
  return items.map((it) => ({
    ...it,
    reactionCounts: countsById[it.id] || {},
    myReactions: mineById[it.id] || [],
    teacherComments: commentsById[it.id] || [],
  }));
}

async function requireAuth(request, env, cors, deps) {
  const account = await deps.getPilotAccountFromRequest(request, env);
  if (!account) return { response: feedJson({ ok: false, error: 'not_authenticated' }, 401, cors) };
  if (deps.pilotAccountRequiresChangePassword && deps.pilotAccountRequiresChangePassword(account)) {
    return { response: feedJson({ ok: false, error: 'must_change_password' }, 403, cors) };
  }
  return { account };
}

async function requireTeacher(request, env, cors, deps) {
  const auth = await requireAuth(request, env, cors, deps);
  if (auth.response) return auth;
  if (!isTeacherLike(auth.account.role)) {
    return { response: feedJson({ ok: false, error: 'forbidden' }, 403, cors) };
  }
  return auth;
}

async function parseJsonBody(request) {
  const text = await request.text();
  try {
    return JSON.parse(text || '{}');
  } catch (_) {
    return null;
  }
}

function validateFeedType(type) {
  return Object.prototype.hasOwnProperty.call(FEED_TYPES, type);
}

function validateStatusTransition(from, to, isTeacher) {
  const f = String(from || '').toLowerCase();
  const t = String(to || '').toLowerCase();
  if (isTeacher) {
    if (f === 'submitted' && ['approved', 'rejected', 'draft'].includes(t)) return true;
    if (f === 'approved' && t === 'hidden') return true;
    if (f === 'hidden' && t === 'approved') return true;
    if (f === 'rejected' && t === 'draft') return true;
    return false;
  }
  if (f === 'draft' && t === 'submitted') return true;
  if (f === 'rejected' && t === 'draft') return true;
  if (f === 'rejected' && t === 'submitted') return true;
  return false;
}

export async function handleFeedRoutes(request, url, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return feedJson({ ok: false, error: 'DB not configured' }, 503, cors);
  const origin = url.origin || '';

  if (request.method === 'GET' && path === '/api/feed') {
    const params = Object.fromEntries(url.searchParams.entries());
    const viewerCharacterName = (params.viewer || params.character_name || '').trim();
    let items = await collectApprovedFeed(db, origin, { limit: parseInt(params.limit || '200', 10) });
    items = filterFeedItems(items, params);
    items = await attachReactionsAndComments(db, items, viewerCharacterName);
    return feedJson({ ok: true, items, meta: { count: items.length, contract: 'lantern-feed-v1' } }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/feed/slideshow') {
    const params = { slideshow: '1', limit: url.searchParams.get('limit') || '30' };
    let items = await collectApprovedFeed(db, origin, { limit: 50 });
    items = filterFeedItems(items, params);
    items = items.filter((it) => it.slideshowEligible || it.imageUrl || it.thumbnailUrl);
    return feedJson({ ok: true, items }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/feed/mine') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    const rows = await db.prepare(
      'SELECT * FROM lantern_feed_items WHERE author_display_name = ? OR author_id = ? ORDER BY created_at DESC'
    ).bind(authorKey, String(auth.account.username || '')).all();
    const items = (rows.results || []).map((r) => normalizeFeedItemRow(r, origin, 'feed'));
    return feedJson({ ok: true, items }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/feed/review') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const status = (url.searchParams.get('status') || 'submitted').trim().toLowerCase();
    const rows = await db.prepare(
      'SELECT * FROM lantern_feed_items WHERE LOWER(TRIM(status)) = ? ORDER BY submitted_at ASC, created_at ASC'
    ).bind(status).all();
    const items = (rows.results || []).map((r) => normalizeFeedItemRow(r, origin, 'feed'));
    return feedJson({ ok: true, items }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/create') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const type = String(body.type || 'article').trim().toLowerCase();
    if (!validateFeedType(type)) return feedJson({ ok: false, error: 'Invalid type' }, 400, cors);
    const title = String(body.title || '').trim();
    if (!title) return feedJson({ ok: false, error: 'Missing title' }, 400, cors);
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    const now = new Date().toISOString();
    const id = 'feed-' + crypto.randomUUID();
    const role = normalizeRole(auth.account.role);
    const status = isTeacherLike(role) && body.auto_approve ? 'approved' : 'draft';
    await db.prepare(
      `INSERT INTO lantern_feed_items (id, type, title, body, summary, author_id, author_display_name, author_role, image_r2_key, video_r2_key, link_url, tags, status, created_at, approved_at, approved_by, extra_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      type,
      title,
      String(body.body || '').trim() || null,
      String(body.summary || '').trim() || null,
      String(auth.account.username || ''),
      authorKey,
      role,
      body.image_r2_key || null,
      body.video_r2_key || null,
      body.link_url || null,
      body.tags ? JSON.stringify(body.tags) : '[]',
      status,
      now,
      status === 'approved' ? now : null,
      status === 'approved' ? String(auth.account.display_name || auth.account.username) : null,
      body.extra_json ? (typeof body.extra_json === 'string' ? body.extra_json : JSON.stringify(body.extra_json)) : null
    ).run();
    return feedJson({ ok: true, id, status }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/update') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    if (!id) return feedJson({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(id).first();
    if (!row) return feedJson({ ok: false, error: 'Not found' }, 404, cors);
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    const isOwner = row.author_display_name === authorKey || row.author_id === String(auth.account.username);
    const isStaff = isTeacherLike(auth.account.role);
    if (!isOwner && !isStaff) return feedJson({ ok: false, error: 'forbidden' }, 403, cors);
    const st = String(row.status || '').toLowerCase();
    if (!isStaff && !['draft', 'rejected'].includes(st)) {
      return feedJson({ ok: false, error: 'Cannot edit while submitted or approved' }, 400, cors);
    }
    if (body.status && String(body.status).toLowerCase() !== st) {
      return feedJson({ ok: false, error: 'Status changes must use submit/review endpoints' }, 400, cors);
    }
    const title = body.title != null ? String(body.title).trim() : row.title;
    const articleBody = body.body != null ? String(body.body).trim() : row.body;
    const summary = body.summary != null ? String(body.summary).trim() : row.summary;
    const type = body.type && validateFeedType(body.type) ? body.type : row.type;
    await db.prepare(
      'UPDATE lantern_feed_items SET title = ?, body = ?, summary = ?, type = ?, image_r2_key = COALESCE(?, image_r2_key), tags = COALESCE(?, tags) WHERE id = ?'
    ).bind(
      title,
      articleBody,
      summary,
      type,
      body.image_r2_key != null ? body.image_r2_key : null,
      body.tags ? JSON.stringify(body.tags) : null,
      id
    ).run();
    return feedJson({ ok: true, id }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/submit') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(id).first();
    if (!row) return feedJson({ ok: false, error: 'Not found' }, 404, cors);
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    if (row.author_display_name !== authorKey && row.author_id !== String(auth.account.username)) {
      return feedJson({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const st = String(row.status || '').toLowerCase();
    if (!['draft', 'rejected'].includes(st)) return feedJson({ ok: false, error: 'Invalid status for submit' }, 400, cors);
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE lantern_feed_items SET status = 'submitted', submitted_at = ?, private_feedback = NULL WHERE id = ?"
    ).bind(now, id).run();
    return feedJson({ ok: true, id, status: 'submitted' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/approve') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(id).first();
    if (!row) return feedJson({ ok: false, error: 'Not found' }, 404, cors);
    if (!validateStatusTransition(row.status, 'approved', true)) {
      return feedJson({ ok: false, error: 'Invalid transition' }, 400, cors);
    }
    const now = new Date().toISOString();
    const approver = String(auth.account.display_name || auth.account.username);
    const slideshow = body.slideshow_eligible ? 1 : (row.slideshow_eligible || 0);
    const featured = body.featured_eligible ? 1 : (row.featured_eligible || 0);
    await db.prepare(
      "UPDATE lantern_feed_items SET status = 'approved', approved_at = ?, approved_by = ?, private_feedback = NULL, slideshow_eligible = ?, featured_eligible = ?, hidden_at = NULL, hidden_by = NULL WHERE id = ?"
    ).bind(now, approver, slideshow, featured, id).run();
    // Prompt #165 — First Photo Share / Shout-Out Someone action completions from Create feed.
    try {
      const feedType = String(row.type || '').trim();
      const author = String(row.author_display_name || row.author_id || '').trim();
      if (author && feedType === 'photo') {
        await ensureContentApprovedMissionCompletion(db, env, 'photo', author, id);
      } else if (author && feedType === 'shout_out') {
        await ensureContentApprovedMissionCompletion(db, env, 'shoutout', author, id);
      }
    } catch (_) {}
    return feedJson({ ok: true, id, status: 'approved' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/reject') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(id).first();
    if (!row) return feedJson({ ok: false, error: 'Not found' }, 404, cors);
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE lantern_feed_items SET status = 'rejected', private_feedback = ?, approved_at = NULL, approved_by = ? WHERE id = ?"
    ).bind(String(body.private_feedback || body.feedback || '').trim() || null, String(auth.account.display_name || auth.account.username), id).run();
    return feedJson({ ok: true, id, status: 'rejected' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/return') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    await db.prepare(
      "UPDATE lantern_feed_items SET status = 'rejected', private_feedback = ? WHERE id = ?"
    ).bind(String(body.private_feedback || body.feedback || 'Please revise and resubmit.').trim(), id).run();
    return feedJson({ ok: true, id, status: 'rejected' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/hide') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE lantern_feed_items SET status = 'hidden', hidden_at = ?, hidden_by = ? WHERE id = ?"
    ).bind(now, String(auth.account.display_name || auth.account.username), id).run();
    return feedJson({ ok: true, id, status: 'hidden' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/metadata') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const row = await db.prepare('SELECT id FROM lantern_feed_items WHERE id = ?').bind(id).first();
    if (!row) return feedJson({ ok: false, error: 'Not found' }, 404, cors);
    await db.prepare(
      'UPDATE lantern_feed_items SET type = COALESCE(?, type), tags = COALESCE(?, tags), slideshow_eligible = COALESCE(?, slideshow_eligible), featured_eligible = COALESCE(?, featured_eligible), home_eligible = COALESCE(?, home_eligible) WHERE id = ?'
    ).bind(
      body.type && validateFeedType(body.type) ? body.type : null,
      body.tags ? JSON.stringify(body.tags) : null,
      body.slideshow_eligible != null ? (body.slideshow_eligible ? 1 : 0) : null,
      body.featured_eligible != null ? (body.featured_eligible ? 1 : 0) : null,
      body.home_eligible != null ? (body.home_eligible ? 1 : 0) : null,
      id
    ).run();
    return feedJson({ ok: true, id }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/feed/comments') {
    const feedItemId = (url.searchParams.get('feed_item_id') || '').trim();
    if (!feedItemId) return feedJson({ ok: false, error: 'Missing feed_item_id' }, 400, cors);
    const rows = await db.prepare(
      'SELECT id, feed_item_id, author_display_name, author_role, body, created_at FROM lantern_feed_comments WHERE feed_item_id = ? ORDER BY created_at ASC'
    ).bind(feedItemId).all();
    const comments = (rows.results || []).map((r) => ({
      id: r.id,
      feedItemId: r.feed_item_id,
      authorDisplayName: r.author_display_name,
      authorRole: r.author_role,
      body: r.body,
      createdAt: r.created_at,
      isTeacherComment: true,
    }));
    return feedJson({ ok: true, comments }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/comments') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const feedItemId = String(body.feed_item_id || body.item_id || '').trim();
    const commentBody = String(body.body || '').trim();
    if (!feedItemId || !commentBody) return feedJson({ ok: false, error: 'Missing fields' }, 400, cors);
    const item = await db.prepare('SELECT id, status FROM lantern_feed_items WHERE id = ?').bind(feedItemId).first();
    if (!item || String(item.status).toLowerCase() !== 'approved') {
      return feedJson({ ok: false, error: 'Comments only on approved feed items' }, 400, cors);
    }
    const id = 'fcomment-' + crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO lantern_feed_comments (id, feed_item_id, author_id, author_display_name, author_role, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      feedItemId,
      String(auth.account.username || ''),
      String(auth.account.display_name || auth.account.username),
      normalizeRole(auth.account.role),
      commentBody,
      now
    ).run();
    return feedJson({ ok: true, id }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/feed/comments/delete') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    await db.prepare('DELETE FROM lantern_feed_comments WHERE id = ?').bind(id).run();
    return feedJson({ ok: true }, 200, cors);
  }

  return feedJson({ ok: false, error: 'Not found' }, 404, cors);
}

function normalizeTriviaRow(row) {
  return {
    id: row.id,
    question: row.question,
    correctAnswer: row.correct_answer,
    wrongAnswers: [row.wrong_answer_1, row.wrong_answer_2, row.wrong_answer_3].filter(Boolean),
    imageR2Key: row.image_r2_key,
    authorDisplayName: row.author_display_name,
    status: row.status,
    privateFeedback: row.private_feedback,
    live: !!row.live,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
  };
}

export async function handleTriviaRoutes(request, url, path, env, cors, deps) {
  const db = env.DB;
  if (!db) return feedJson({ ok: false, error: 'DB not configured' }, 503, cors);

  if (request.method === 'GET' && path === '/api/trivia/live') {
    const rows = await db.prepare(
      "SELECT id, question, correct_answer, wrong_answer_1, wrong_answer_2, wrong_answer_3, image_r2_key FROM lantern_trivia_questions WHERE LOWER(TRIM(status)) = 'approved' AND live = 1 AND (hidden_at IS NULL OR hidden_at = '') ORDER BY approved_at DESC"
    ).all();
    const questions = (rows.results || []).map((r) => {
      const options = [r.correct_answer, r.wrong_answer_1, r.wrong_answer_2, r.wrong_answer_3].filter(Boolean);
      const shuffled = options.slice().sort(() => Math.random() - 0.5);
      const correctIndex = shuffled.indexOf(r.correct_answer);
      return {
        id: r.id,
        question: r.question,
        options: shuffled,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        imageR2Key: r.image_r2_key,
      };
    });
    return feedJson({ ok: true, questions }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/trivia/mine') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    const rows = await db.prepare(
      'SELECT * FROM lantern_trivia_questions WHERE author_display_name = ? ORDER BY created_at DESC'
    ).bind(authorKey).all();
    return feedJson({ ok: true, items: (rows.results || []).map(normalizeTriviaRow) }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/trivia/review') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const rows = await db.prepare(
      "SELECT * FROM lantern_trivia_questions WHERE LOWER(TRIM(status)) = 'submitted' ORDER BY submitted_at ASC"
    ).all();
    return feedJson({ ok: true, items: (rows.results || []).map(normalizeTriviaRow) }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/trivia/create') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const question = String(body.question || '').trim();
    const correct = String(body.correct_answer || '').trim();
    const w1 = String(body.wrong_answer_1 || '').trim();
    const w2 = String(body.wrong_answer_2 || '').trim();
    if (!question || !correct || !w1 || !w2) return feedJson({ ok: false, error: 'Missing required fields' }, 400, cors);
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    const id = 'trivia-' + crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO lantern_trivia_questions (id, question, correct_answer, wrong_answer_1, wrong_answer_2, wrong_answer_3, image_r2_key, author_id, author_display_name, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
    ).bind(
      id,
      question,
      correct,
      w1,
      w2,
      String(body.wrong_answer_3 || '').trim() || null,
      body.image_r2_key || null,
      String(auth.account.username || ''),
      authorKey,
      now
    ).run();
    return feedJson({ ok: true, id, status: 'draft' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/trivia/submit') {
    const auth = await requireAuth(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const row = await db.prepare('SELECT * FROM lantern_trivia_questions WHERE id = ?').bind(id).first();
    if (!row) return feedJson({ ok: false, error: 'Not found' }, 404, cors);
    const authorKey = authorKeyFromAccount(auth.account, deps.pilotEconomyCharacterName);
    if (row.author_display_name !== authorKey) return feedJson({ ok: false, error: 'forbidden' }, 403, cors);
    const st = String(row.status || '').toLowerCase();
    if (!['draft', 'rejected'].includes(st)) return feedJson({ ok: false, error: 'Invalid status' }, 400, cors);
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE lantern_trivia_questions SET status = 'submitted', submitted_at = ?, private_feedback = NULL WHERE id = ?"
    ).bind(now, id).run();
    return feedJson({ ok: true, id, status: 'submitted' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/trivia/approve') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE lantern_trivia_questions SET status = 'approved', approved_at = ?, approved_by = ?, live = 1, private_feedback = NULL WHERE id = ?"
    ).bind(now, String(auth.account.display_name || auth.account.username), id).run();
    return feedJson({ ok: true, id, status: 'approved' }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/trivia/reject') {
    const auth = await requireTeacher(request, env, cors, deps);
    if (auth.response) return auth.response;
    const body = await parseJsonBody(request);
    if (!body) return feedJson({ ok: false, error: 'Invalid JSON' }, 400, cors);
    const id = String(body.id || '').trim();
    await db.prepare(
      "UPDATE lantern_trivia_questions SET status = 'rejected', private_feedback = ?, live = 0 WHERE id = ?"
    ).bind(String(body.private_feedback || '').trim() || null, id).run();
    return feedJson({ ok: true, id, status: 'rejected' }, 200, cors);
  }

  return feedJson({ ok: false, error: 'Not found' }, 404, cors);
}

export async function isApprovedFeedItem(db, itemId) {
  if (itemId.startsWith('news:')) {
    const rawId = itemId.slice(5);
    const row = await db.prepare("SELECT id, status FROM lantern_news_submissions WHERE id = ? AND LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '')").bind(rawId).first();
    return !!row;
  }
  if (itemId.startsWith('mission:')) {
    const rawId = itemId.slice(8);
    const row = await db.prepare("SELECT id FROM lantern_mission_submissions WHERE id = ? AND LOWER(TRIM(status)) = 'accepted' AND (hidden_at IS NULL OR hidden_at = '')").bind(rawId).first();
    return !!row;
  }
  const row = await db.prepare("SELECT id FROM lantern_feed_items WHERE id = ? AND LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '')").bind(itemId).first();
  return !!row;
}
