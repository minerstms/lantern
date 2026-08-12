/**
 * Prompt #165 — one narrow server-side mission completion primitive for verified events.
 * Reuses creditMissionApprovalReward / TMS lantern:mission_reward:<submission_id>.
 * Does not create a second reward ledger.
 */
import { creditMissionApprovalReward } from './missions-reward.js';
import { denverLocalDateYYYYMMDD, SCHOOL_SCHEDULE_TIMEZONE } from './school-schedule.js';

export const WAVE2_MISSION_IDS = {
  DAILY_CHECKIN: 'perm_daily_checkin',
  FIRST_GAME: 'perm_first_game',
  GRADE_REFLECTION: 'perm_grade_reflection',
  FIRST_PHOTO: 'tmission_1773676581540_qzl0kx',
  CREATE_POLL: 'perm_create_a_poll',
  SHOUTOUT: 'perm_shoutout_someone',
  /** Prompt #204 — Thank a Teacher (direct email; daily cadence). */
  THANK_YOU: 'perm_thank_you',
};

export const DAILY_CHECKIN_CHOICES = ['Ready', 'Okay', 'Tired', 'Need a reset'];

export function eventKeyDailyCheckin(characterName, dayYYYYMMDD) {
  return `daily_checkin:${String(characterName || '').trim()}:${String(dayYYYYMMDD || '').trim()}`;
}

export function eventKeyFirstGame(characterName) {
  return `first_game:${String(characterName || '').trim()}`;
}

export function eventKeyFirstPhoto(characterName) {
  return `first_photo:${String(characterName || '').trim()}`;
}

export function eventKeyCreatePoll(characterName) {
  return `create_poll:${String(characterName || '').trim()}`;
}

export function eventKeyShoutout(characterName) {
  return `shoutout:${String(characterName || '').trim()}`;
}

/**
 * Prompt #102 — system event-completion rows (Create-a-Poll progress, First Game, Daily Check-In,
 * etc.) are durable mission history markers, not public Explore content. They use
 * submission_type=confirmation + reviewed_by=system (see completeMissionByEvent inserts).
 * Explore must not surface them as generic mission cards alongside the real poll/photo/etc.
 */
export function isSystemMissionEventMarkerSubmission(row) {
  if (!row || typeof row !== 'object') return false;
  const st = String(row.submission_type || '').trim().toLowerCase();
  const by = String(row.reviewed_by || '').trim().toLowerCase();
  if (st === 'confirmation' && by === 'system') return true;
  return false;
}

export function eventKeyThankYou(characterName, dayYYYYMMDD) {
  return `thank_you:${String(characterName || '').trim()}:${String(dayYYYYMMDD || '').trim()}`;
}

/** Deterministic submission id derived from event_key (safe for D1 TEXT PK). */
export function submissionIdForEventKey(eventKey) {
  const safe = String(eventKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `msub_evt_${safe || 'unknown'}`;
}

function completionIdForEventKey(eventKey) {
  const safe = String(eventKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `mcomp_${safe || 'unknown'}`;
}

async function findCompletionByEventKey(db, eventKey) {
  try {
    return (
      (await db
        .prepare(
          'SELECT id, mission_id, character_name, trigger_type, event_key, source_ref, submission_id, created_at FROM lantern_mission_completions WHERE event_key = ?'
        )
        .bind(eventKey)
        .first()) || null
    );
  } catch (_) {
    return null;
  }
}

async function findOnceCompletion(db, missionId, characterName) {
  try {
    return (
      (await db
        .prepare(
          'SELECT id, event_key, submission_id, created_at FROM lantern_mission_completions WHERE mission_id = ? AND character_name = ? ORDER BY created_at ASC LIMIT 1'
        )
        .bind(missionId, characterName)
        .first()) || null
    );
  } catch (_) {
    return null;
  }
}

async function findAcceptedSubmission(db, missionId, characterName) {
  return (
    (await db
      .prepare(
        "SELECT id, created_at FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted' ORDER BY created_at ASC LIMIT 1"
      )
      .bind(missionId, characterName)
      .first()) || null
  );
}

async function insertCompletionRow(db, row) {
  await db
    .prepare(
      'INSERT INTO lantern_mission_completions (id, mission_id, character_name, trigger_type, event_key, source_ref, submission_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      row.id,
      row.mission_id,
      row.character_name,
      row.trigger_type,
      row.event_key,
      row.source_ref,
      row.submission_id,
      row.created_at
    )
    .run();
}

/**
 * Verified event → durable completion → exactly +1 via TMS (unless skipReward / already paid).
 *
 * @param {'once'|'daily'} opts.cadence
 * @param {boolean} [opts.skipReward] reconcile historical completion without awarding again
 */
export async function completeMissionByEvent(db, env, opts) {
  const missionId = String((opts && opts.missionId) || '').trim();
  const characterName = String((opts && opts.characterName) || '').trim();
  const triggerType = String((opts && opts.triggerType) || '').trim();
  const eventKey = String((opts && opts.eventKey) || '').trim();
  const sourceRef = opts && opts.sourceRef != null ? String(opts.sourceRef).trim().slice(0, 200) : null;
  const cadence = (opts && opts.cadence) === 'daily' ? 'daily' : 'once';
  const skipReward = !!(opts && opts.skipReward);
  const content = String((opts && opts.content) || 'confirmed').trim().slice(0, 500) || 'confirmed';
  const note = String((opts && opts.note) || 'Mission completed').trim().slice(0, 200) || 'Mission completed';

  if (!missionId || !characterName || !triggerType || !eventKey) {
    return { ok: false, error: 'missing_params' };
  }

  const existingEvent = await findCompletionByEventKey(db, eventKey);
  if (existingEvent) {
    return {
      ok: true,
      idempotent: true,
      completed: true,
      rewarded: false,
      mission_id: missionId,
      event_key: eventKey,
      submission_id: existingEvent.submission_id || null,
    };
  }

  if (cadence === 'once') {
    const priorComp = await findOnceCompletion(db, missionId, characterName);
    if (priorComp) {
      return {
        ok: true,
        idempotent: true,
        completed: true,
        rewarded: false,
        already_completed: true,
        mission_id: missionId,
        event_key: priorComp.event_key,
        submission_id: priorComp.submission_id || null,
      };
    }
    const priorSub = await findAcceptedSubmission(db, missionId, characterName);
    if (priorSub) {
      const now = new Date().toISOString();
      const compId = completionIdForEventKey(eventKey);
      try {
        await insertCompletionRow(db, {
          id: compId,
          mission_id: missionId,
          character_name: characterName,
          trigger_type: triggerType,
          event_key: eventKey,
          source_ref: sourceRef || priorSub.id,
          submission_id: priorSub.id,
          created_at: now,
        });
      } catch (e) {
        const again = await findCompletionByEventKey(db, eventKey);
        if (again) {
          return {
            ok: true,
            idempotent: true,
            completed: true,
            rewarded: false,
            mission_id: missionId,
            event_key: eventKey,
            submission_id: again.submission_id || priorSub.id,
          };
        }
        return { ok: false, error: 'completion_insert_failed', detail: String(e && e.message ? e.message : e) };
      }
      return {
        ok: true,
        reconciled: true,
        completed: true,
        rewarded: false,
        mission_id: missionId,
        event_key: eventKey,
        submission_id: priorSub.id,
      };
    }
  }

  const submissionId = submissionIdForEventKey(eventKey);
  const now = new Date().toISOString();
  const existingSub = await db
    .prepare('SELECT id, status FROM lantern_mission_submissions WHERE id = ?')
    .bind(submissionId)
    .first();

  if (!existingSub) {
    try {
      await db
        .prepare(
          'INSERT INTO lantern_mission_submissions (id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          submissionId,
          missionId,
          characterName,
          'confirmation',
          content,
          'accepted',
          now,
          now,
          'system'
        )
        .run();
    } catch (e) {
      const again = await db.prepare('SELECT id, status FROM lantern_mission_submissions WHERE id = ?').bind(submissionId).first();
      if (!again) {
        return { ok: false, error: 'submission_insert_failed', detail: String(e && e.message ? e.message : e) };
      }
    }
  } else if (String(existingSub.status) !== 'accepted') {
    await db
      .prepare(
        'UPDATE lantern_mission_submissions SET status = ?, reviewed_at = ?, reviewed_by = ?, submission_content = ? WHERE id = ?'
      )
      .bind('accepted', now, 'system', content, submissionId)
      .run();
  }

  let rewarded = false;
  let rewardIdempotent = false;
  if (!skipReward) {
    const credit = await creditMissionApprovalReward(db, characterName, submissionId, 1, note, { env });
    if (!credit.ok) {
      return { ok: false, error: credit.error || 'reward_failed', submission_id: submissionId };
    }
    rewarded = !credit.idempotent;
    rewardIdempotent = !!credit.idempotent;
  }

  const compId = completionIdForEventKey(eventKey);
  try {
    await insertCompletionRow(db, {
      id: compId,
      mission_id: missionId,
      character_name: characterName,
      trigger_type: triggerType,
      event_key: eventKey,
      source_ref: sourceRef,
      submission_id: submissionId,
      created_at: now,
    });
  } catch (e) {
    const again = await findCompletionByEventKey(db, eventKey);
    if (!again) {
      // Reward may already have been issued; surface as accepted_without_completion_row for ops.
      return {
        ok: false,
        error: 'completion_insert_failed',
        detail: String(e && e.message ? e.message : e),
        submission_id: submissionId,
        rewarded: rewarded || rewardIdempotent,
      };
    }
    return {
      ok: true,
      idempotent: true,
      completed: true,
      rewarded: false,
      mission_id: missionId,
      event_key: eventKey,
      submission_id: again.submission_id || submissionId,
    };
  }

  return {
    ok: true,
    idempotent: rewardIdempotent && !rewarded,
    completed: true,
    rewarded: rewarded,
    reward_idempotent: rewardIdempotent,
    mission_id: missionId,
    event_key: eventKey,
    submission_id: submissionId,
  };
}

export async function ensureFirstGameMissionCompletion(db, env, characterName, sourceRef) {
  const key = String(characterName || '').trim();
  if (!key) return { ok: false, error: 'missing_identity' };

  // Historical authoritative first_game ledger row → reconcile without another reward.
  const hist = await db
    .prepare("SELECT id FROM lantern_transactions WHERE character_name = ? AND kind = 'first_game' ORDER BY created_at ASC LIMIT 1")
    .bind(key)
    .first();
  if (hist) {
    return completeMissionByEvent(db, env, {
      missionId: WAVE2_MISSION_IDS.FIRST_GAME,
      characterName: key,
      triggerType: 'game_play_first',
      eventKey: eventKeyFirstGame(key),
      sourceRef: sourceRef || hist.id,
      cadence: 'once',
      skipReward: true,
      note: 'First Game Played (reconciled)',
      content: 'confirmed:historical_first_game',
    });
  }

  return completeMissionByEvent(db, env, {
    missionId: WAVE2_MISSION_IDS.FIRST_GAME,
    characterName: key,
    triggerType: 'game_play_first',
    eventKey: eventKeyFirstGame(key),
    sourceRef: sourceRef || null,
    cadence: 'once',
    note: 'First Game Played',
    content: 'confirmed:game_play',
  });
}

export async function ensureContentApprovedMissionCompletion(db, env, kind, characterName, sourceRef) {
  const key = String(characterName || '').trim();
  if (!key) return { ok: false, error: 'missing_identity' };
  const k = String(kind || '').trim();
  let missionId;
  let eventKey;
  let triggerType;
  let note;
  // Prompt #224 — Create a Poll / Shout-Out Someone remain once-ever mission *progress*
  // markers, but Nuggets for those creation categories come from the daily content-creation
  // reward cap (content_reward:{type}:{student}:{YYYY-MM-DD}), not a second mission payout.
  let skipReward = false;
  if (k === 'photo') {
    missionId = WAVE2_MISSION_IDS.FIRST_PHOTO;
    eventKey = eventKeyFirstPhoto(key);
    triggerType = 'content_approved_photo';
    note = 'First Photo Share';
  } else if (k === 'poll') {
    missionId = WAVE2_MISSION_IDS.CREATE_POLL;
    eventKey = eventKeyCreatePoll(key);
    triggerType = 'content_approved_poll';
    note = 'Create a Poll';
    skipReward = true;
  } else if (k === 'shoutout') {
    missionId = WAVE2_MISSION_IDS.SHOUTOUT;
    eventKey = eventKeyShoutout(key);
    triggerType = 'content_approved_shoutout';
    note = 'Shout-Out Someone';
    skipReward = true;
  } else {
    return { ok: false, error: 'unknown_content_kind' };
  }
  return completeMissionByEvent(db, env, {
    missionId,
    characterName: key,
    triggerType,
    eventKey,
    sourceRef: sourceRef || null,
    cadence: 'once',
    skipReward,
    note,
    content: `confirmed:${k}:${sourceRef || ''}`.slice(0, 500),
  });
}

export async function claimDailyCheckInForCharacter(db, env, characterName, choice, now) {
  const key = String(characterName || '').trim();
  if (!key) return { ok: false, error: 'missing_identity' };
  const choiceNorm = String(choice || '').trim();
  if (!DAILY_CHECKIN_CHOICES.includes(choiceNorm)) {
    return { ok: false, error: 'invalid_choice' };
  }
  const day = denverLocalDateYYYYMMDD(now);
  const eventKey = eventKeyDailyCheckin(key, day);
  const result = await completeMissionByEvent(db, env, {
    missionId: WAVE2_MISSION_IDS.DAILY_CHECKIN,
    characterName: key,
    triggerType: 'daily_checkin',
    eventKey,
    sourceRef: null,
    cadence: 'daily',
    note: 'Daily Check-In',
    content: JSON.stringify({ choice: choiceNorm, day, tz: SCHOOL_SCHEDULE_TIMEZONE }),
  });
  if (!result.ok) return result;
  return {
    ...result,
    day,
    choice: choiceNorm,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
  };
}

export async function getMissionProgressForCharacter(db, characterName, now) {
  const key = String(characterName || '').trim();
  const day = denverLocalDateYYYYMMDD(now);
  const out = {
    ok: true,
    character_name: key,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    day,
    daily_checkin: { completed_today: false, day, choice: null },
    first_game: { completed: false },
    first_photo: { completed: false },
    create_poll: { completed: false },
    shoutout: { completed: false },
    thank_you: { completed_today: false, day },
  };
  if (!key) return out;

  const dailyKey = eventKeyDailyCheckin(key, day);
  const daily = await findCompletionByEventKey(db, dailyKey);
  if (daily) {
    out.daily_checkin.completed_today = true;
    try {
      const sub = await db
        .prepare('SELECT submission_content FROM lantern_mission_submissions WHERE id = ?')
        .bind(daily.submission_id || '')
        .first();
      if (sub && sub.submission_content) {
        const parsed = JSON.parse(String(sub.submission_content));
        if (parsed && parsed.choice) out.daily_checkin.choice = parsed.choice;
      }
    } catch (_) {}
  }

  async function onceDone(missionId, slot) {
    const comp = await findOnceCompletion(db, missionId, key);
    if (comp) {
      out[slot].completed = true;
      return;
    }
    const sub = await findAcceptedSubmission(db, missionId, key);
    if (sub) out[slot].completed = true;
  }

  await onceDone(WAVE2_MISSION_IDS.FIRST_GAME, 'first_game');
  if (!out.first_game.completed) {
    const hist = await db
      .prepare("SELECT id FROM lantern_transactions WHERE character_name = ? AND kind = 'first_game' LIMIT 1")
      .bind(key)
      .first();
    if (hist) out.first_game.completed = true;
  }
  await onceDone(WAVE2_MISSION_IDS.FIRST_PHOTO, 'first_photo');
  await onceDone(WAVE2_MISSION_IDS.CREATE_POLL, 'create_poll');
  await onceDone(WAVE2_MISSION_IDS.SHOUTOUT, 'shoutout');

  const thankKey = eventKeyThankYou(key, day);
  const thankDone = await findCompletionByEventKey(db, thankKey);
  if (thankDone) out.thank_you.completed_today = true;

  return out;
}

export { denverLocalDateYYYYMMDD, SCHOOL_SCHEDULE_TIMEZONE };
