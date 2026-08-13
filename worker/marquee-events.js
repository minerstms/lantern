/**
 * Prompt #137 — public marquee event feed synthesized at read time from existing D1 rows.
 * No new table. Deterministic event IDs. Public ticker is a short newest-first window.
 */
import { isSystemMissionEventMarkerSubmission } from './mission-event-completions.js';
import { isPeerShoutOutNewsSubmission } from './feed-handlers.js';
import { loadContentPeopleIndex } from './content-people.js';
import {
  loadStaffPublicNameIndex,
  formatPublicStaffName,
  formatCompactPersonName,
  overlayNewsRowRecognizedStaff,
  overlayRecognitionListRow,
  resolveAuthorPublicLabel,
  resolveMissionCreatorPublicLabel,
  resolveMissionSubmitterPublicLabel,
  resolvePublicDisplayName,
} from './staff-public-name.js';
import { filterOutDemoPersonas } from './demo-persona-guard.js';
import { isLowerIsBetterGame } from './lantern-game-catalog.js';

export const MARQUEE_PUBLIC_LIMIT = 40;
export const MARQUEE_INSPECTOR_LIMIT = 200;
export const MARQUEE_FAMILY_FETCH = 24;
export const MARQUEE_LEADERBOARD_PERIOD = 'weekly';
export const MARQUEE_LEADERBOARD_RANK_SIZE = 8;
export const MARQUEE_BOARD_ENTRY_META_KEY = 'marquee_board_entry';

export const MARQUEE_EVENT_TYPES = Object.freeze({
  POLL_CREATED: 'poll_created',
  MISSION_CREATED: 'mission_created',
  MISSION_COMPLETED: 'mission_completed',
  SHOUT_OUT: 'shout_out',
  NEWS: 'news',
  LEADERBOARD_ENTRY: 'leaderboard_entry',
  RECOGNITION: 'recognition',
});

export const MARQUEE_TYPE_LABELS = Object.freeze({
  poll_created: 'Poll Created',
  mission_created: 'Mission Created',
  mission_completed: 'Mission Completed',
  shout_out: 'Shout-Out',
  news: 'News',
  leaderboard_entry: 'Leaderboard Entry',
  recognition: 'Shout-Out',
});

const INTERNAL_TOKEN_RE = /(confirmed:|\bstaff:|\bstaff_id:)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const ECONOMY_KEY_RE = /\b(staff_id:\d+|lantern_staff:\d+|msub_evt_|mcomp_)/i;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function isoTime(v) {
  return trimStr(v) || '';
}

export function marqueeEventId(type, sourceId) {
  return String(type || '') + ':' + String(sourceId || '');
}

export function isInternalConfirmationContent(raw) {
  const t = trimStr(raw);
  if (!t) return false;
  const low = t.toLowerCase();
  if (low.startsWith('confirmed:')) return true;
  if (/confirmed:poll:/i.test(t)) return true;
  return false;
}

export function isHiddenAtSet(row) {
  return !!trimStr(row && row.hidden_at);
}

/** Student-facing mission listing: active=1 AND archived=0. Missing flags are treated as listed. */
export function isMissionPubliclyListed(row) {
  if (!row) return false;
  if (row.archived != null && Number(row.archived) === 1) return false;
  if (row.active != null && Number(row.active) !== 1) return false;
  return true;
}

export function isExcludedMissionCompletion(row) {
  if (!row) return true;
  if (isHiddenAtSet(row)) return true;
  if (isSystemMissionEventMarkerSubmission(row)) return true;
  const status = trimStr(row.status).toLowerCase();
  if (status && status !== 'accepted') return true;
  if (isInternalConfirmationContent(row.submission_content)) return true;
  if (row.mission_archived != null && Number(row.mission_archived) === 1) return true;
  if (row.mission_active != null && Number(row.mission_active) !== 1) return true;
  return false;
}

export function detectLeaderboardEntryTransition(beforeNames, afterNames, characterName) {
  const key = trimStr(characterName).toLowerCase();
  if (!key) return false;
  const before = new Set((beforeNames || []).map((n) => trimStr(n).toLowerCase()).filter(Boolean));
  const after = new Set((afterNames || []).map((n) => trimStr(n).toLowerCase()).filter(Boolean));
  return !before.has(key) && after.has(key);
}

export function publicTextLooksUnsafe(text) {
  const t = String(text || '');
  if (!t) return true;
  if (EMAIL_RE.test(t)) return true;
  if (ECONOMY_KEY_RE.test(t)) return true;
  if (INTERNAL_TOKEN_RE.test(t)) return true;
  if (/confirmed:poll:/i.test(t)) return true;
  return false;
}

export function sanitizePublicMarqueeText(text, fallback) {
  const t = trimStr(text).replace(/\s+/g, ' ');
  if (!t || publicTextLooksUnsafe(t)) return trimStr(fallback) || 'Lantern update';
  return t.slice(0, 180);
}

function weeklySinceIso(nowMs) {
  const now = nowMs ? new Date(nowMs) : new Date();
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export async function queryWeeklyTopCharacterNames(db, gameName, opts) {
  const limit = (opts && opts.limit) || MARQUEE_LEADERBOARD_RANK_SIZE;
  const since = (opts && opts.since) || weeklySinceIso(opts && opts.nowMs);
  if (!db || !trimStr(gameName)) return [];
  const lowerBetter = isLowerIsBetterGame(gameName);
  const agg = lowerBetter ? 'MIN(score)' : 'MAX(score)';
  const orderBy = lowerBetter ? 'ORDER BY score ASC' : 'ORDER BY score DESC';
  try {
    const rows = await db
      .prepare(
        `SELECT character_name, ${agg} AS score FROM lantern_leaderboard_entries WHERE game_name = ? AND created_at >= ? GROUP BY character_name ${orderBy} LIMIT ?`
      )
      .bind(gameName, since, limit)
      .all();
    return (rows.results || []).map((r) => trimStr(r.character_name)).filter(Boolean);
  } catch (_) {
    return [];
  }
}

export function withBoardEntryMeta(meta, entered) {
  const out = meta && typeof meta === 'object' ? { ...meta } : {};
  if (entered) out[MARQUEE_BOARD_ENTRY_META_KEY] = true;
  else delete out[MARQUEE_BOARD_ENTRY_META_KEY];
  return out;
}

function eventRecord(partial) {
  const type = partial.type;
  const id = partial.id || marqueeEventId(type, partial.source_id);
  const publicText = sanitizePublicMarqueeText(partial.public_text, partial.fallback_text);
  return {
    id,
    event_key: id,
    type,
    type_label: MARQUEE_TYPE_LABELS[type] || type,
    public_text: publicText,
    created_at: isoTime(partial.created_at),
    eligible: partial.eligible !== false,
    source_type: partial.source_type || type,
    source_id: String(partial.source_id || ''),
    source_title: trimStr(partial.source_title),
    excluded_reason: partial.excluded_reason || null,
  };
}

async function loadStudentLabelIndex(db) {
  const byKey = Object.create(null);
  if (!db) return byKey;
  try {
    const res = await db
      .prepare(
        `SELECT username, display_name, public_display_name, first_name, last_name, student_character_name, mtss_student_id, identity_display, role
         FROM lantern_pilot_accounts
         WHERE lower(trim(role)) = 'student'`
      )
      .all();
    (res.results || []).forEach((row) => {
      const label = resolvePublicDisplayName(row) || 'A student';
      ['username', 'mtss_student_id', 'student_character_name', 'display_name'].forEach((k) => {
        const v = trimStr(row[k]).toLowerCase();
        if (v) byKey[v] = label;
      });
    });
  } catch (_) {
    try {
      const res = await db
        .prepare(
          `SELECT username, display_name, student_character_name, mtss_student_id, role
           FROM lantern_pilot_accounts
           WHERE lower(trim(role)) = 'student'`
        )
        .all();
      (res.results || []).forEach((row) => {
        const label = formatCompactPersonName(row.display_name || row.student_character_name) || 'A student';
        ['username', 'mtss_student_id', 'student_character_name', 'display_name'].forEach((k) => {
          const v = trimStr(row[k]).toLowerCase();
          if (v) byKey[v] = label;
        });
      });
    } catch (e2) {
      return byKey;
    }
  }
  return byKey;
}

function publicActorLabel(characterName, staffIndex, studentIndex) {
  const key = trimStr(characterName);
  if (!key) return 'A student';
  const staff = resolveMissionSubmitterPublicLabel(staffIndex, key, '');
  if (key.toLowerCase().startsWith('staff:') || key.toLowerCase().startsWith('staff_id:')) {
    return staff || 'Staff';
  }
  const mapped = studentIndex && studentIndex[key.toLowerCase()];
  if (mapped) return mapped;
  if (staff) return staff;
  return 'A student';
}

async function fetchPolls(db, limit) {
  try {
    const rows = await db
      .prepare(
        `SELECT id, question, character_name, created_at, approved_at, hidden_at FROM lantern_polls
         WHERE approved_at IS NOT NULL AND (hidden_at IS NULL OR hidden_at = '')
         ORDER BY approved_at DESC LIMIT ?`
      )
      .bind(limit)
      .all();
    return (rows.results || []).filter((r) => r.approved_at && !isHiddenAtSet(r));
  } catch (_) {
    return [];
  }
}

async function fetchMissionsCreated(db, limit) {
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, teacher_id, teacher_name, created_at, active, archived
         FROM lantern_missions
         WHERE COALESCE(active, 1) = 1 AND COALESCE(archived, 0) = 0
         ORDER BY created_at DESC LIMIT ?`
      )
      .bind(limit)
      .all();
    return (rows.results || []).filter(isMissionPubliclyListed);
  } catch (_) {
    return [];
  }
}

async function fetchMissionCompletions(db, limit) {
  try {
    const rows = await db
      .prepare(
        `SELECT s.id, s.mission_id, s.character_name, s.submission_type, s.submission_content, s.status,
                s.created_at, s.reviewed_at, s.reviewed_by, s.hidden_at,
                m.title AS mission_title, m.active AS mission_active, m.archived AS mission_archived
         FROM lantern_mission_submissions s
         LEFT JOIN lantern_missions m ON m.id = s.mission_id
         WHERE LOWER(TRIM(s.status)) = 'accepted'
           AND (s.hidden_at IS NULL OR s.hidden_at = '')
         ORDER BY COALESCE(s.reviewed_at, s.created_at) DESC LIMIT ?`
      )
      .bind(limit * 3)
      .all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

async function fetchApprovedNews(db, limit) {
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, body, actor_id, author_name, author_type, category, created_at, reviewed_at, status, hidden_at
         FROM lantern_news_submissions
         WHERE LOWER(TRIM(status)) = 'approved' AND (hidden_at IS NULL OR hidden_at = '')
         ORDER BY reviewed_at DESC, created_at DESC LIMIT ?`
      )
      .bind(limit)
      .all();
    return (rows.results || []).filter((r) => String(r.status || '').trim().toLowerCase() === 'approved' && !isHiddenAtSet(r));
  } catch (_) {
    return [];
  }
}

async function fetchRecognition(db, limit) {
  try {
    const rows = await db
      .prepare(
        `SELECT id, character_name, message, created_at, created_by_teacher_id, created_by_teacher_name
         FROM lantern_teacher_recognition
         ORDER BY created_at DESC LIMIT ?`
      )
      .bind(limit)
      .all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

async function fetchLeaderboardEntryRows(db, limit) {
  try {
    const rows = await db
      .prepare(
        `SELECT id, game_name, character_name, score, score_display, meta_json, created_at
         FROM lantern_leaderboard_entries
         WHERE json_extract(meta_json, '$.${MARQUEE_BOARD_ENTRY_META_KEY}') = 1
         ORDER BY created_at DESC LIMIT ?`
      )
      .bind(limit)
      .all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

function sortNewestFirst(events) {
  return (events || []).slice().sort((a, b) => {
    const ta = Date.parse(a.created_at || '') || 0;
    const tb = Date.parse(b.created_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function filterMarqueeEvents(events, opts) {
  const list = Array.isArray(events) ? events.slice() : [];
  const type = trimStr(opts && opts.type).toLowerCase();
  const q = trimStr(opts && opts.q).toLowerCase();
  const sort = trimStr(opts && opts.sort) || 'newest';
  let out = list;
  if (type && type !== 'all') {
    const want =
      type === 'poll'
        ? ['poll_created']
        : type === 'mission_created'
          ? ['mission_created']
          : type === 'mission_completed'
            ? ['mission_completed']
            : type === 'shout-out' || type === 'shout_out'
              ? ['shout_out', 'recognition']
              : type === 'news'
                ? ['news']
                : type === 'leaderboard' || type === 'leaderboard_entry'
                  ? ['leaderboard_entry']
                  : [type];
    out = out.filter((e) => want.indexOf(e.type) >= 0);
  }
  if (q) {
    out = out.filter((e) => {
      const blob = [e.public_text, e.type_label, e.source_title, e.type].join(' ').toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }
  if (sort === 'oldest') {
    out = sortNewestFirst(out).reverse();
  } else if (sort === 'type') {
    out = out.slice().sort((a, b) => {
      const c = String(a.type_label).localeCompare(String(b.type_label));
      if (c) return c;
      return (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0);
    });
  } else if (sort === 'title' || sort === 'text') {
    out = out.slice().sort((a, b) => String(a.public_text).localeCompare(String(b.public_text)));
  } else {
    out = sortNewestFirst(out);
  }
  return out;
}

export function eventsToTickerSlides(events) {
  return (events || []).map((e) => {
    const type =
      e.type === 'shout_out' || e.type === 'news' || e.type === 'recognition'
        ? 'student_news'
        : e.type === 'poll_created'
          ? 'poll'
          : e.type === 'leaderboard_entry'
            ? 'arcade_leader'
            : e.type === 'mission_created' || e.type === 'mission_completed'
              ? 'featured_creation'
              : 'student_news';
    return {
      type,
      contentType: e.type === 'shout_out' || e.type === 'recognition' ? 'shout_out' : e.type === 'poll_created' ? 'poll' : 'news',
      title: e.public_text,
      subtitle: e.type_label,
      created_at: e.created_at,
      meta: {
        marquee_event_id: e.id,
        marquee_type: e.type,
        source_id: e.source_id,
      },
    };
  });
}

/**
 * @param {object} db
 * @param {{ limit?: number, forDisplay?: boolean, hallwayNewsFilter?: Function, hallwayRecognitionFilter?: Function }} [opts]
 */
export async function collectMarqueeEvents(db, opts) {
  const limit = Math.min(
    MARQUEE_INSPECTOR_LIMIT,
    Math.max(1, Math.floor(Number((opts && opts.limit) || MARQUEE_PUBLIC_LIMIT)))
  );
  const familyCap = opts && opts.inspector ? 80 : MARQUEE_FAMILY_FETCH;
  const family = Math.min(familyCap, limit);
  const staffIndex = await loadStaffPublicNameIndex(db);
  const studentIndex = await loadStudentLabelIndex(db);
  const peopleIndex = await loadContentPeopleIndex(db);

  const [polls, missions, completions, newsRows, recognitionRows, lbRows] = await Promise.all([
    fetchPolls(db, family),
    fetchMissionsCreated(db, family),
    fetchMissionCompletions(db, family),
    fetchApprovedNews(db, family),
    fetchRecognition(db, family),
    fetchLeaderboardEntryRows(db, family),
  ]);

  let newsList = filterOutDemoPersonas(newsRows, 'author_name');
  let recList = filterOutDemoPersonas(recognitionRows, 'character_name');
  if (opts && opts.forDisplay) {
    if (typeof opts.hallwayNewsFilter === 'function') {
      newsList = await opts.hallwayNewsFilter(db, newsList);
    }
    if (typeof opts.hallwayRecognitionFilter === 'function') {
      recList = await opts.hallwayRecognitionFilter(db, recList);
    }
  }

  const events = [];
  const seen = Object.create(null);

  function push(ev) {
    if (!ev || !ev.id || seen[ev.id]) return;
    if (ev.eligible === false) return;
    seen[ev.id] = true;
    events.push(ev);
  }

  polls.forEach((row) => {
    if (!row.approved_at || isHiddenAtSet(row)) return;
    const q = trimStr(row.question) || 'a new poll';
    push(
      eventRecord({
        type: MARQUEE_EVENT_TYPES.POLL_CREATED,
        source_id: row.id,
        source_type: 'poll',
        source_title: q,
        created_at: row.approved_at || row.created_at,
        public_text: 'New poll: ' + q,
      })
    );
  });

  missions.forEach((row) => {
    if (!isMissionPubliclyListed(row)) return;
    const title = trimStr(row.title) || 'a new mission';
    const author = resolveMissionCreatorPublicLabel(staffIndex, row.teacher_id, row.teacher_name);
    const line = author ? 'New mission from ' + author + ': ' + title : 'New mission: ' + title;
    push(
      eventRecord({
        type: MARQUEE_EVENT_TYPES.MISSION_CREATED,
        source_id: row.id,
        source_type: 'mission',
        source_title: title,
        created_at: row.created_at,
        public_text: line,
      })
    );
  });

  completions.forEach((row) => {
    if (isExcludedMissionCompletion(row)) return;
    const title = trimStr(row.mission_title) || 'a mission';
    const who = publicActorLabel(row.character_name, staffIndex, studentIndex);
    push(
      eventRecord({
        type: MARQUEE_EVENT_TYPES.MISSION_COMPLETED,
        source_id: row.id,
        source_type: 'mission_submission',
        source_title: title,
        created_at: row.reviewed_at || row.created_at,
        public_text: who + ' completed ' + title,
      })
    );
  });

  newsList.forEach((row) => {
    if (isHiddenAtSet(row) || String(row.status || '').trim().toLowerCase() !== 'approved') return;
    const people = peopleIndex.get('news|' + trimStr(row.id)) || [];
    const overlaid = overlayNewsRowRecognizedStaff({ ...row }, staffIndex, people);
    const isShout = isPeerShoutOutNewsSubmission(overlaid) || /shout/i.test(String(overlaid.category || ''));
    const author =
      resolveAuthorPublicLabel(staffIndex, {
        actor_id: overlaid.actor_id,
        author_name: overlaid.author_name,
        author_type: overlaid.author_type,
        authorRole: overlaid.author_type,
      }) || formatCompactPersonName(overlaid.author_name);
    const title = trimStr(overlaid.title) || (isShout ? 'Shout-Out' : 'News');
    const recognized = trimStr(overlaid.recognition_public_label);
    let publicText;
    if (isShout && recognized) {
      publicText = author ? 'Shout-Out: ' + recognized + ' · ' + author : 'Shout-Out: ' + recognized;
    } else if (isShout) {
      publicText = author ? title + ' · ' + author : title;
    } else {
      publicText = author ? title + ' · ' + author : title;
    }
    push(
      eventRecord({
        type: isShout ? MARQUEE_EVENT_TYPES.SHOUT_OUT : MARQUEE_EVENT_TYPES.NEWS,
        source_id: row.id,
        source_type: 'news',
        source_title: title,
        created_at: overlaid.reviewed_at || overlaid.created_at,
        public_text: publicText,
      })
    );
  });

  recList.forEach((row) => {
    const people = peopleIndex.get('recognition|' + trimStr(row.id)) || [];
    const overlaid = overlayRecognitionListRow({ ...row }, staffIndex, people);
    const who =
      trimStr(overlaid.character_public_label) ||
      publicActorLabel(overlaid.character_name, staffIndex, studentIndex);
    const author = trimStr(overlaid.created_by_teacher_public_label);
    const msg = trimStr(overlaid.message).slice(0, 80);
    const publicText = author
      ? who + ' — ' + (msg || 'recognized') + ' · ' + author
      : who + (msg ? ' — ' + msg : '');
    push(
      eventRecord({
        type: MARQUEE_EVENT_TYPES.RECOGNITION,
        source_id: row.id,
        source_type: 'recognition',
        source_title: who,
        created_at: overlaid.created_at,
        public_text: publicText,
      })
    );
  });

  filterOutDemoPersonas(lbRows, 'character_name').forEach((row) => {
    const who = publicActorLabel(row.character_name, staffIndex, studentIndex);
    const game = trimStr(row.game_name) || 'a game';
    push(
      eventRecord({
        type: MARQUEE_EVENT_TYPES.LEADERBOARD_ENTRY,
        source_id: row.id,
        source_type: 'leaderboard',
        source_title: game,
        created_at: row.created_at,
        public_text: who + ' joined the ' + game + ' leaderboard',
      })
    );
  });

  return sortNewestFirst(events).slice(0, limit);
}
