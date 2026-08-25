/**
 * Prompt #174 — Fight Song Challenge (line reorder).
 * Server owns canonical order and completion. Reuses completeMissionByEvent
 * (existing lantern_mission_submissions + lantern_mission_completions + TMS mission reward).
 * No schema migration. Client `correct` flags are ignored.
 */
import { completeMissionByEvent } from './mission-event-completions.js';
import { isEveryCompletionMode, resolveMissionRewardMode } from './mission-reward-mode.js';

export const FIGHT_SONG_MISSION_ID = 'perm_fight_song';
export const FIGHT_SONG_TRIGGER_TYPE = 'fight_song_reorder';
export const FIGHT_SONG_ACTIVITY_TYPE = 'line_reorder';
export const FIGHT_SONG_REWARD_NUGGETS = 1;
export const FIGHT_SONG_WRONG_MESSAGE = 'Not quite — keep working.';
export const FIGHT_SONG_SUCCESS_MESSAGE = 'Nice work! You put the fight song in the correct order.';

/** School-provided fight-song PDF wording — locked. Do not rewrite. */
export const FIGHT_SONG_LINES = [
  { id: 'fight_line_1', text: 'Stand up and cheer,' },
  { id: 'fight_line_2', text: 'Stand up and cheer for dear old Trinidad.' },
  { id: 'fight_line_3', text: 'For today we raise' },
  { id: 'fight_line_4', text: 'the Blue and White above the rest.' },
  { id: 'fight_line_5', text: 'Our teams are fighting,' },
  { id: 'fight_line_6', text: 'and they are bound to win this game.' },
  { id: 'fight_line_7', text: 'We’ve got the team;' },
  { id: 'fight_line_8', text: 'we’ve got the steam,' },
  { id: 'fight_line_9', text: 'for this is Trinidad High School’s day!' },
];

export const FIGHT_SONG_CANONICAL_IDS = FIGHT_SONG_LINES.map((line) => line.id);

export const FIGHT_SONG_MISSION = {
  id: FIGHT_SONG_MISSION_ID,
  type: FIGHT_SONG_ACTIVITY_TYPE,
  title: 'Fight Song Challenge',
  description: 'Put the lines of the school fight song in the correct order.',
  reward_nuggets: FIGHT_SONG_REWARD_NUGGETS,
  trigger_type: FIGHT_SONG_TRIGGER_TYPE,
  icon: '🎺',
};

export function eventKeyFightSong(characterName) {
  return `${FIGHT_SONG_TRIGGER_TYPE}:${String(characterName || '').trim()}`;
}

export function isFightSongMissionId(missionId) {
  return String(missionId || '').trim() === FIGHT_SONG_MISSION_ID;
}

export function isCanonicalFightSongOrder(ids) {
  if (!Array.isArray(ids) || ids.length !== FIGHT_SONG_CANONICAL_IDS.length) return false;
  for (let i = 0; i < FIGHT_SONG_CANONICAL_IDS.length; i++) {
    if (String(ids[i] || '').trim() !== FIGHT_SONG_CANONICAL_IDS[i]) return false;
  }
  return true;
}

export function normalizeFightSongOrder(raw) {
  if (!Array.isArray(raw) || raw.length !== FIGHT_SONG_CANONICAL_IDS.length) return null;
  const ids = raw.map((id) => String(id || '').trim());
  if (ids.some((id) => !id)) return null;
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  for (const need of FIGHT_SONG_CANONICAL_IDS) {
    if (!seen.has(need)) return null;
  }
  return ids;
}

function fisherYates(ids, rand) {
  const out = ids.slice();
  const rnd = typeof rand === 'function' ? rand : Math.random;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Valid permutation of all 9 line IDs; never the already-correct order. */
export function shuffleFightSongIds(rand) {
  let ids = fisherYates(FIGHT_SONG_CANONICAL_IDS, rand);
  for (let attempt = 0; attempt < 24 && isCanonicalFightSongOrder(ids); attempt++) {
    ids = fisherYates(FIGHT_SONG_CANONICAL_IDS, rand);
  }
  if (isCanonicalFightSongOrder(ids) && ids.length >= 2) {
    const last = ids.length - 1;
    const tmp = ids[last];
    ids[last] = ids[last - 1];
    ids[last - 1] = tmp;
  }
  return ids;
}

export function overlayFightSongMission(list) {
  const out = Array.isArray(list) ? list.slice() : [];
  const have = out.some((m) => isFightSongMissionId(m && m.id));
  const createdAt = '2026-08-14T00:00:00.000Z';
  if (!have) {
    out.push({
      id: FIGHT_SONG_MISSION_ID,
      title: FIGHT_SONG_MISSION.title,
      description: FIGHT_SONG_MISSION.description,
      reward_amount: FIGHT_SONG_REWARD_NUGGETS,
      submission_type: 'confirmation',
      created_by_teacher_id: 'mr_radle',
      created_by_teacher_name: 'Mr. Radle',
      audience: 'school_mission',
      participant_scope: 'everyone',
      target_character_names: [],
      featured: false,
      active: true,
      archived: false,
      site_eligible: false,
      allows_text: false,
      allows_image: false,
      allows_video: false,
      allows_link: false,
      min_characters: 0,
      card_image_r2_key: null,
      card_image_url: null,
      created_at: createdAt,
      activity: {
        type: FIGHT_SONG_ACTIVITY_TYPE,
        reward_nuggets: FIGHT_SONG_REWARD_NUGGETS,
        line_count: FIGHT_SONG_LINES.length,
      },
    });
  }
  return out.map((m) => {
    if (!isFightSongMissionId(m && m.id)) return m;
    return {
      ...m,
      title: m.title || FIGHT_SONG_MISSION.title,
      description: m.description || FIGHT_SONG_MISSION.description,
      participant_scope: 'everyone',
      reward_amount: m.reward_amount != null && m.reward_amount !== '' ? m.reward_amount : FIGHT_SONG_REWARD_NUGGETS,
      activity: {
        type: FIGHT_SONG_ACTIVITY_TYPE,
        reward_nuggets: m.reward_amount != null && m.reward_amount !== '' ? m.reward_amount : FIGHT_SONG_REWARD_NUGGETS,
        line_count: FIGHT_SONG_LINES.length,
      },
    };
  });
}

export async function ensureFightSongMission(db) {
  if (!db) return;
  const createdAt = '2026-08-14T00:00:00.000Z';
  try {
    await db
      .prepare(
        'INSERT OR IGNORE INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        FIGHT_SONG_MISSION_ID,
        'mr_radle',
        'Mr. Radle',
        FIGHT_SONG_MISSION.title,
        FIGHT_SONG_MISSION.description,
        FIGHT_SONG_REWARD_NUGGETS,
        'confirmation',
        'school_mission',
        'everyone',
        null,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        createdAt
      )
      .run();
  } catch (_) {
    try {
      await db
        .prepare(
          'INSERT OR IGNORE INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, featured, active, site_eligible, created_at, allows_text, allows_image, allows_video, allows_link, min_characters) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          FIGHT_SONG_MISSION_ID,
          'mr_radle',
          'Mr. Radle',
          FIGHT_SONG_MISSION.title,
          FIGHT_SONG_MISSION.description,
          FIGHT_SONG_REWARD_NUGGETS,
          'confirmation',
          'school_mission',
          0,
          1,
          0,
          createdAt,
          0,
          0,
          0,
          0,
          0
        )
        .run();
    } catch (_) {}
  }
}

/**
 * Authoritative check. Client-reported `correct` / reward fields are ignored.
 * Wrong order never completes or awards. Correct order uses completeMissionByEvent (once-ever reward).
 * Replay after completion is allowed; reward stays once-ever.
 */
export async function checkFightSongOrder(db, env, opts) {
  const characterName = String((opts && opts.characterName) || '').trim();
  const missionId = String((opts && opts.missionId) || FIGHT_SONG_MISSION_ID).trim();
  if (!characterName) return { ok: false, error: 'missing_identity', _httpStatus: 401 };
  if (!isFightSongMissionId(missionId)) return { ok: false, error: 'invalid_mission', _httpStatus: 400 };

  const order = normalizeFightSongOrder(opts && (opts.order || opts.line_ids || opts.lines));
  if (!order) return { ok: false, error: 'invalid_order', _httpStatus: 400 };

  await ensureFightSongMission(db);

  if (!isCanonicalFightSongOrder(order)) {
    return {
      ok: true,
      correct: false,
      completed: false,
      rewarded: false,
      mission_id: FIGHT_SONG_MISSION_ID,
      message: FIGHT_SONG_WRONG_MESSAGE,
    };
  }

  const rewardMode = await resolveMissionRewardMode(db, missionId);
  const everyMode = isEveryCompletionMode(rewardMode);
  const attemptId = String((opts && (opts.attemptId || opts.attempt_id)) || '').trim();
  let eventKey;
  if (everyMode) {
    if (!attemptId) {
      return { ok: false, error: 'missing_attempt_id', _httpStatus: 400 };
    }
    eventKey = `${FIGHT_SONG_TRIGGER_TYPE}:${characterName}:${attemptId}`;
  } else {
    eventKey = eventKeyFightSong(characterName);
  }

  const result = await completeMissionByEvent(db, env, {
    missionId: FIGHT_SONG_MISSION_ID,
    characterName,
    triggerType: FIGHT_SONG_TRIGGER_TYPE,
    eventKey,
    sourceRef: everyMode ? attemptId : 'fight_song_check',
    cadence: 'once',
    rewardMode,
    note: FIGHT_SONG_MISSION.title,
    content: JSON.stringify({
      type: FIGHT_SONG_ACTIVITY_TYPE,
      order,
    }).slice(0, 500),
  });
  if (!result.ok) {
    return { ok: false, error: result.error || 'completion_failed', _httpStatus: 500 };
  }

  return {
    ok: true,
    correct: true,
    completed: true,
    rewarded: !!result.rewarded,
    reward_idempotent: !!(result.idempotent || result.reward_idempotent),
    already_completed: !!result.already_completed || (!result.rewarded && !!(result.idempotent || result.reconciled)),
    mission_id: FIGHT_SONG_MISSION_ID,
    message: FIGHT_SONG_SUCCESS_MESSAGE,
    balance_after: result.balance_after != null ? result.balance_after : undefined,
  };
}
