/**
 * Lantern missions routes — session-authoritative (Prompt #66).
 */
import {
  awardAchievementsForMissionAccepted,
  awardAchievementsForMissionSubmit,
  awardAchievementsForEconomyTransact,
  awardAchievementsAfterPositiveCredit,
} from './locker-achievements.js';
import {
  isAdminRole,
  isSelfMissionSubmission,
  missionVisibleToParticipant,
  missionVisibleToStudent,
  missionEditLockedFieldsPresent,
  missionIsUnusedAndDeletable,
  normalizeParticipantScope,
  normalizeSubmissionType,
  parseTargetCharacterNames,
  requireMissionSession,
  requireMissionTeacher,
  extractMissionSubmissionMedia,
  resolveParticipantMissionIdentity,
  resolveStudentMissionIdentity,
  resolveSubmissionHistoryIdentity,
  reviewerLabelFromAccount,
  sessionTeacherId,
  teacherOwnsMission,
  validateMissionSubmissionPayload,
} from './missions-auth.js';
import { approveMissionWithReward, missionRewardTxId } from './missions-reward.js';
import {
  WAVE2_MISSION_IDS,
  claimDailyCheckInForCharacter,
  ensureContentApprovedMissionCompletion,
  ensureFirstGameMissionCompletion,
  getMissionProgressForCharacter,
} from './mission-event-completions.js';
import { sendThankYouMission } from './thank-you-mission.js';

function missionRowToJson(r) {
  let target = parseTargetCharacterNames(r.target_character_names);
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    // Prompt #159: ordinary mission reward is always 1 in API responses (definitions normalized).
    reward_amount: 1,
    submission_type: r.submission_type || 'text',
    created_by_teacher_id: r.teacher_id || 'teacher',
    created_by_teacher_name: r.teacher_name || 'Teacher',
    audience: r.audience || 'school_mission',
    // Prompt #107: students | staff | everyone (default students for historical rows).
    participant_scope: normalizeParticipantScope(r.participant_scope),
    target_character_names: target,
    featured: !!r.featured,
    active: r.active !== 0,
    // Prompt #103: archive is a lifecycle state distinct from active/paused; defaults to 0 for
    // pre-migration rows via the additive column default, so existing missions read as not archived.
    archived: !!r.archived,
    site_eligible: !!r.site_eligible,
    allows_text: r.allows_text !== undefined && r.allows_text !== null ? !!r.allows_text : true,
    allows_image: !!(r.allows_image),
    allows_video: !!(r.allows_video),
    allows_link: !!(r.allows_link),
    min_characters:
      r.min_characters !== undefined && r.min_characters !== null
        ? Math.max(0, Math.floor(Number(r.min_characters)) || 200)
        : 200,
    created_at: r.created_at || '',
    // Only populated by the teacher-owned list query below (submission_count is a joined
    // aggregate, not a real column) — undefined here means "not requested", not "zero".
    submission_count: r.submission_count !== undefined ? Number(r.submission_count) || 0 : undefined,
  };
}

function mapCharacterSubmissionRow(s, byMission) {
  const m = byMission[s.mission_id] || {};
  let image_url = null;
  if (s.submission_type === 'image_url' && s.submission_content) {
    image_url = String(s.submission_content).trim().slice(0, 1000);
  } else if (s.submission_type === 'text' && s.submission_content) {
    try {
      const parsed = typeof s.submission_content === 'string' ? JSON.parse(s.submission_content) : s.submission_content;
      if (parsed.image_url || parsed.image) image_url = String(parsed.image_url || parsed.image || '').trim().slice(0, 1000);
    } catch (_) {}
  }
  const isVideo = (s.submission_type || '') === 'video';
  const video_url = isVideo && s.submission_content ? String(s.submission_content).trim().slice(0, 2000) : undefined;
  return {
    id: s.id,
    mission_id: s.mission_id,
    character_name: s.character_name,
    submission_type: s.submission_type,
    submission_content: s.submission_content || '',
    status: s.status,
    created_at: s.created_at,
    reviewed_at: s.reviewed_at || null,
    reviewed_by: s.reviewed_by || '',
    returned_reason: s.returned_reason && String(s.returned_reason).trim() ? String(s.returned_reason).trim() : null,
    returned_at: s.returned_at || null,
    mission_title: m.title || '',
    mission_reward: m.reward_amount != null ? m.reward_amount : 1,
    created_by_teacher_name: m.teacher_name || 'Teacher',
    image_url: image_url || undefined,
    video_url: video_url || undefined,
  };
}

async function loadFullMission(db, missionId) {
  return db
    .prepare(
      'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE id = ?'
    )
    .bind(missionId)
    .first();
}

async function countMissionSubmissions(db, missionId) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM lantern_mission_submissions WHERE mission_id = ?')
    .bind(missionId)
    .first();
  return row ? Number(row.n) || 0 : 0;
}

async function handlePollAndBugSideEffects(db, row, now) {
  if ((row.submission_type || '').trim() === 'poll' && row.submission_content) {
    let pollData;
    try {
      pollData = JSON.parse(row.submission_content);
    } catch (_) {
      pollData = null;
    }
    if (
      pollData &&
      typeof pollData.question === 'string' &&
      Array.isArray(pollData.choices) &&
      pollData.choices.length >= 2 &&
      pollData.choices.length <= 5
    ) {
      const pollId = 'poll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      const choicesJson = JSON.stringify(pollData.choices.map((c) => String(c).trim().slice(0, 200)));
      const pollImageUrl =
        (pollData.image_url && String(pollData.image_url).trim().slice(0, 500)) ||
        (pollData.image && String(pollData.image).trim().slice(0, 500)) ||
        null;
      try {
        await db
          .prepare(
            'INSERT INTO lantern_polls (id, mission_submission_id, question, choices_json, image_url, character_name, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            pollId,
            row.id,
            String(pollData.question).trim().slice(0, 500),
            choicesJson,
            pollImageUrl,
            row.character_name || '',
            now,
            now
          )
          .run();
      } catch (e) {
        try {
          await db
            .prepare(
              'INSERT INTO lantern_polls (id, mission_submission_id, question, choices_json, character_name, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .bind(
              pollId,
              row.id,
              String(pollData.question).trim().slice(0, 500),
              choicesJson,
              row.character_name || '',
              now,
              now
            )
            .run();
        } catch (e2) {
          return { ok: false, error: 'Poll image persistence requires DB migration 034 (add image_url to lantern_polls)' };
        }
      }
    }
  }
  if ((row.submission_type || '').trim() === 'bug_report' && row.submission_content) {
    let bugData;
    try {
      bugData = typeof row.submission_content === 'string' ? JSON.parse(row.submission_content) : row.submission_content;
    } catch (_) {
      bugData = { description: row.submission_content };
    }
    const desc = (bugData.description || String(row.submission_content || '')).trim().slice(0, 2000);
    const imgUrl = (bugData.image_url || bugData.image || '').trim().slice(0, 500) || null;
    const bugId = 'bug_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    try {
      await db
        .prepare(
          'INSERT INTO lantern_bug_reports (id, character_name, description, image_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(bugId, row.character_name || '', desc, imgUrl, 'approved', now)
        .run();
    } catch (_) {}
  }
  return { ok: true };
}

export async function handleMissionsRoutes(request, url, path, env, cors, deps) {
  const db = env.DB;
  const jsonResponse = deps.jsonResponse;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
  const pilotEconomyCharacterName = deps.pilotEconomyCharacterName;

  if (request.method === 'GET' && path === '/api/missions/active') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveParticipantMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const rows = await db
      .prepare(
        // Prompt #103 + #107: active+unarchived; participant_scope filtered in JS.
        'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE active = 1 AND archived = 0 ORDER BY featured DESC, created_at DESC'
      )
      .all();
    let list = (rows.results || []).map((r) => missionRowToJson(r));
    list = list.filter((m) => missionVisibleToParticipant(m, identity));
    return jsonResponse({ ok: true, missions: list }, 200, cors);
  }

  // Prompt #165 — authoritative Wave-2 progress (Denver day + once-ever flags).
  if (request.method === 'GET' && path === '/api/missions/progress') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveParticipantMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    try {
      await ensureFirstGameMissionCompletion(db, env, identity.characterName, null);
    } catch (_) {}
    const progress = await getMissionProgressForCharacter(db, identity.characterName, new Date());
    return jsonResponse(progress, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/daily-checkin') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveParticipantMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const result = await claimDailyCheckInForCharacter(db, env, identity.characterName, body.choice, new Date());
    if (!result.ok) {
      const code = result.error === 'invalid_choice' ? 400 : 500;
      return jsonResponse({ ok: false, error: result.error }, code, cors);
    }
    return jsonResponse(
      {
        ok: true,
        completed: true,
        idempotent: !!result.idempotent,
        rewarded: !!result.rewarded,
        day: result.day,
        choice: result.choice,
        timezone: result.timezone,
        nuggets: result.rewarded || result.reward_idempotent ? 1 : 0,
        mission_id: WAVE2_MISSION_IDS.DAILY_CHECKIN,
      },
      200,
      cors
    );
  }

  // Prompt #204 — Thank a Teacher: email first, then completion +1 (no review queue).
  if (request.method === 'POST' && path === '/api/missions/thank-you') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveParticipantMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const result = await sendThankYouMission(db, env, {
      account: auth.account,
      characterName: identity.characterName,
      recipient_token: body.recipient_token || body.staff_token || body.token,
      message: body.message,
      now: new Date(),
    });
    if (!result.ok) {
      const status = result._httpStatus && result._httpStatus >= 400 ? result._httpStatus : 400;
      const err = String(result.error || '');
      const userMessage =
        err === 'mail_send_failed' ||
        err.startsWith('mail_send_failed:') ||
        err === 'mail_request_failed' ||
        err === 'mail_bad_response' ||
        err === 'mail_not_configured' ||
        err === 'bridge_not_configured'
          ? "Your thank-you couldn't be sent. Please try again."
          : result.error === 'staff_email_missing'
            ? "Your thank-you couldn't be sent. Please try again."
            : result.error === 'message_too_short'
              ? 'Please write a longer thank-you message.'
              : result.error === 'message_too_long'
                ? 'Please shorten your thank-you message.'
                : result.error === 'recipient_required' || result.error === 'recipient_invalid'
                  ? 'Please choose a staff member.'
                  : result.error === 'send_in_progress'
                    ? 'Sending… please wait.'
                    : result.error === 'students_only'
                      ? 'Only students can complete this mission.'
                      : "Your thank-you couldn't be sent. Please try again.";
      return jsonResponse({ ok: false, error: result.error, message: userMessage }, status, cors);
    }
    return jsonResponse(
      {
        ok: true,
        completed: true,
        idempotent: !!result.idempotent,
        rewarded: !!result.rewarded,
        day: result.day,
        timezone: result.timezone,
        recipient_label: result.recipient_label,
        nuggets: 1,
        mission_id: WAVE2_MISSION_IDS.THANK_YOU,
      },
      200,
      cors
    );
  }

  if (request.method === 'GET' && path === '/api/missions/teacher') {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const isAdmin = isAdminRole(auth.account.role);
    // Admin broader scope: with no explicit ?teacher_id=, admin sees every
    // teacher's missions (matches teacherOwnsMission() already granting
    // admin full authority over all missions). A non-admin teacher is always
    // scoped to their own session-derived teacher id.
    let teacherId = isAdmin ? (url.searchParams.get('teacher_id') || '').trim() : sessionTeacherId(auth.account);
    if (!isAdmin && !teacherId) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const rows = teacherId
      ? await db
          .prepare(
            'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE teacher_id = ? ORDER BY created_at DESC'
          )
          .bind(teacherId)
          .all()
      : await db
          .prepare(
            'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, archived, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions ORDER BY created_at DESC'
          )
          .all();
    // Prompt #103: Missions workspace mission cards show a submission count ("N submissions") —
    // one small grouped query instead of a per-mission subquery, only on this teacher-owned list.
    const missionIds = (rows.results || []).map((r) => r.id);
    let countsByMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const countRows = await db
        .prepare(
          'SELECT mission_id, COUNT(*) AS n FROM lantern_mission_submissions WHERE mission_id IN (' + placeholders + ') GROUP BY mission_id'
        )
        .bind(...missionIds)
        .all();
      (countRows.results || []).forEach((c) => { countsByMission[c.mission_id] = Number(c.n) || 0; });
    }
    const list = (rows.results || []).map((r) => missionRowToJson({ ...r, submission_count: countsByMission[r.id] || 0 }));
    return jsonResponse({ ok: true, missions: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions') {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const title = (body.title || '').trim().slice(0, 200);
    if (!title) return jsonResponse({ ok: false, error: 'Missing title' }, 400, cors);
    let teacherId = sessionTeacherId(auth.account);
    let teacherName = reviewerLabelFromAccount(auth.account);
    if (isAdminRole(auth.account.role)) {
      // Admin may explicitly author on behalf of a specific teacher_id; otherwise
      // the mission is owned by the admin's own session identity (never an
      // orphaned 'teacher' placeholder that no account can ever list as "mine").
      teacherId = (body.created_by_teacher_id || body.teacher_id || teacherId || 'admin').trim();
      teacherName = (body.created_by_teacher_name || body.teacher_name || teacherName || 'Admin').trim();
    }
    if (!teacherId) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const description = (body.description || '').trim().slice(0, 1000);
    // Prompt #159: ordinary mission reward is locked to exactly 1 Nugget.
    // Client-supplied reward_amount is ignored (was clamp 1–99; DB default still 3 cosmetically).
    const rewardAmount = 1;
    const submissionType = normalizeSubmissionType(body.submission_type, 'text');
    const audience = ['my_students', 'selected_students', 'school_mission'].includes((body.audience || 'school_mission').trim())
      ? (body.audience || 'school_mission').trim()
      : 'school_mission';
    const participantScope = normalizeParticipantScope(body.participant_scope);
    const targetNames = audience === 'selected_students' && Array.isArray(body.target_character_names) ? body.target_character_names : null;
    const featured = !!body.featured;
    const active = body.active !== false;
    const siteEligible = !!body.site_eligible;
    const allowsText = body.allows_text !== false;
    const allowsImage = !!(body.allows_image);
    const allowsVideo = !!(body.allows_video);
    const allowsLink = !!(body.allows_link);
    let minChars = Math.max(0, Math.floor(Number(body.min_characters)));
    if (!Number.isFinite(minChars)) {
      minChars = submissionType === 'bug_report' ? 0 : 200;
    }
    const id = 'tmission_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    await db
      .prepare(
        'INSERT INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, participant_scope, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        id,
        teacherId,
        teacherName,
        title,
        description,
        rewardAmount,
        submissionType,
        audience,
        participantScope,
        targetNames ? JSON.stringify(targetNames) : null,
        featured ? 1 : 0,
        active ? 1 : 0,
        siteEligible ? 1 : 0,
        allowsText ? 1 : 0,
        allowsImage ? 1 : 0,
        allowsVideo ? 1 : 0,
        allowsLink ? 1 : 0,
        minChars,
        now
      )
      .run();
    const mission = {
      id,
      title,
      description,
      reward_amount: rewardAmount,
      submission_type: submissionType,
      created_by_teacher_id: teacherId,
      created_by_teacher_name: teacherName,
      audience,
      participant_scope: participantScope,
      target_character_names: targetNames || undefined,
      featured,
      active,
      archived: false,
      site_eligible: siteEligible,
      allows_text: allowsText,
      allows_image: allowsImage,
      allows_video: allowsVideo,
      allows_link: allowsLink,
      min_characters: minChars,
      created_at: now,
    };
    return jsonResponse({ ok: true, id, mission }, 200, cors);
  }

  const missionIdMatch = path.match(/^\/api\/missions\/([^/]+)$/);
  if (request.method === 'PATCH' && missionIdMatch) {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const id = missionIdMatch[1];
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const row = await db.prepare('SELECT id, teacher_id FROM lantern_missions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    if (!teacherOwnsMission(auth.account, row.teacher_id)) {
      return jsonResponse({ ok: false, error: 'Not authorized' }, 403, cors);
    }
    // Prompt #103 — audience/target_character_names/allows_*/min_characters may only change
    // before a mission's first submission ever exists (server-side enforcement of CURSOR REPLY
    // #100 §5's edit matrix; the client should already avoid sending these once submissions
    // exist, but this must hold even for old/replayed/hand-crafted requests).
    const lockedFieldsRequested = missionEditLockedFieldsPresent(body);
    if (lockedFieldsRequested.length > 0) {
      const submissionCount = await countMissionSubmissions(db, id);
      if (submissionCount > 0) {
        return jsonResponse(
          {
            ok: false,
            error: 'mission_locked_after_first_submission',
            locked_fields: lockedFieldsRequested,
            message: 'Audience and submission requirements can only be changed before a mission receives its first submission.',
          },
          400,
          cors
        );
      }
    }
    const updates = [];
    const bindings = [];
    if (body.active !== undefined) {
      updates.push('active = ?');
      bindings.push(body.active ? 1 : 0);
    }
    if (body.archived !== undefined) {
      const archiving = !!body.archived;
      updates.push('archived = ?');
      bindings.push(archiving ? 1 : 0);
      // Archive always forces active=0 (unavailable to students) in the same update, regardless
      // of any active value also present in this request. Restore (archived: false) deliberately
      // does NOT touch active — a restored mission stays Paused until the teacher explicitly
      // clicks Resume (CURSOR PROMPT #103 "Restore: leave PAUSED").
      if (archiving && body.active === undefined) {
        updates.push('active = ?');
        bindings.push(0);
      }
    }
    if (body.title !== undefined) {
      updates.push('title = ?');
      bindings.push(String(body.title).trim().slice(0, 200));
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      bindings.push(String(body.description).trim().slice(0, 1000));
    }
    if (body.reward_amount !== undefined) {
      // Prompt #159: ordinary mission reward is not editable — always persist 1.
      updates.push('reward_amount = ?');
      bindings.push(1);
    }
    if (body.featured !== undefined) {
      updates.push('featured = ?');
      bindings.push(body.featured ? 1 : 0);
    }
    if (body.site_eligible !== undefined) {
      updates.push('site_eligible = ?');
      bindings.push(body.site_eligible ? 1 : 0);
    }
    if (body.audience !== undefined) {
      updates.push('audience = ?');
      bindings.push(
        ['my_students', 'selected_students', 'school_mission'].includes(String(body.audience).trim())
          ? String(body.audience).trim()
          : 'school_mission'
      );
    }
    if (body.participant_scope !== undefined) {
      updates.push('participant_scope = ?');
      bindings.push(normalizeParticipantScope(body.participant_scope));
    }
    if (body.target_character_names !== undefined) {
      updates.push('target_character_names = ?');
      bindings.push(Array.isArray(body.target_character_names) ? JSON.stringify(body.target_character_names) : null);
    }
    if (body.allows_text !== undefined) {
      updates.push('allows_text = ?');
      bindings.push(body.allows_text ? 1 : 0);
    }
    if (body.allows_image !== undefined) {
      updates.push('allows_image = ?');
      bindings.push(body.allows_image ? 1 : 0);
    }
    if (body.allows_video !== undefined) {
      updates.push('allows_video = ?');
      bindings.push(body.allows_video ? 1 : 0);
    }
    if (body.allows_link !== undefined) {
      updates.push('allows_link = ?');
      bindings.push(body.allows_link ? 1 : 0);
    }
    if (body.min_characters !== undefined) {
      const mc = Math.max(0, Math.floor(Number(body.min_characters)));
      updates.push('min_characters = ?');
      bindings.push(Number.isFinite(mc) ? mc : 200);
    }
    if (updates.length === 0) {
      const m = await loadFullMission(db, id);
      return jsonResponse({ ok: true, mission: m ? missionRowToJson(m) : null }, 200, cors);
    }
    bindings.push(id);
    await db.prepare('UPDATE lantern_missions SET ' + updates.join(', ') + ' WHERE id = ?').bind(...bindings).run();
    const m = await loadFullMission(db, id);
    return jsonResponse({ ok: true, mission: m ? missionRowToJson(m) : null }, 200, cors);
  }

  if (request.method === 'DELETE' && missionIdMatch) {
    // Prompt #103 — hard delete is a secondary/destructive action for genuinely UNUSED missions
    // only. Any submission/dependent history (approvals, published content, rewards, TMS Nugget
    // transactions all key off lantern_mission_submissions.id) means the mission must be
    // archived instead; we never cascade-delete that history.
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const id = missionIdMatch[1];
    const row = await db.prepare('SELECT id, teacher_id FROM lantern_missions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    if (!teacherOwnsMission(auth.account, row.teacher_id)) {
      return jsonResponse({ ok: false, error: 'Not authorized' }, 403, cors);
    }
    const submissionCount = await countMissionSubmissions(db, id);
    if (!missionIsUnusedAndDeletable(submissionCount)) {
      return jsonResponse(
        {
          ok: false,
          error: 'mission_has_history',
          submission_count: submissionCount,
          message: 'This mission has submission history and cannot be deleted. Archive it instead.',
        },
        400,
        cors
      );
    }
    await db.prepare('DELETE FROM lantern_missions WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true, deleted: true, id }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submit') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveParticipantMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const characterName = identity.characterName;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const missionId = (body.mission_id || '').trim();
    if (!missionId) return jsonResponse({ ok: false, error: 'Missing mission_id' }, 400, cors);
    const mission = await loadFullMission(db, missionId);
    if (!mission) return jsonResponse({ ok: false, error: 'Mission not found' }, 404, cors);
    // Prompt #103 — archived missions must reject new submissions even via an old/deep-linked
    // mission_id that a student already has cached client-side; Pause (active=0) already blocked
    // this, Archive must too.
    if (mission.active === 0 || !!mission.archived) return jsonResponse({ ok: false, error: 'Mission is not active' }, 400, cors);
    if (!missionVisibleToParticipant(mission, identity)) {
      return jsonResponse({ ok: false, error: 'Mission not available' }, 403, cors);
    }
    // Prompt #165 — Daily Check-In / First Game use dedicated event endpoints, not free-form submit.
    if (missionId === WAVE2_MISSION_IDS.DAILY_CHECKIN) {
      return jsonResponse({ ok: false, error: 'use_daily_checkin', message: 'Use Daily Check-In to complete this mission.' }, 400, cors);
    }
    if (missionId === WAVE2_MISSION_IDS.FIRST_GAME) {
      return jsonResponse({ ok: false, error: 'use_games', message: 'Play a paid game to complete this mission.' }, 400, cors);
    }
    if (missionId === WAVE2_MISSION_IDS.THANK_YOU) {
      return jsonResponse({ ok: false, error: 'use_thank_you', message: 'Use Thank a Teacher to complete this mission.' }, 400, cors);
    }
    const existing = await db
      .prepare(
        'SELECT id, status FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(missionId, characterName)
      .first();
    if (existing) {
      const est = String(existing.status || '').trim();
      if (est === 'pending') {
        return jsonResponse({ ok: false, error: 'submission_pending', submission_id: existing.id }, 409, cors);
      }
      if (est === 'returned') {
        return jsonResponse({ ok: false, error: 'use_resubmit', submission_id: existing.id }, 409, cors);
      }
      if (est === 'accepted' || est === 'rejected') {
        return jsonResponse({ ok: false, error: 'already_submitted' }, 409, cors);
      }
    }
    const submissionTypeRaw = (body.submission_type || mission.submission_type || 'text').trim();
    const contentMax = submissionTypeRaw === 'poll' || submissionTypeRaw === 'bug_report' ? 4000 : 2000;
    const contentIn = String(body.submission_content || '').trim().slice(0, contentMax);
    const validated = validateMissionSubmissionPayload(mission, submissionTypeRaw, contentIn);
    if (!validated.ok) {
      return jsonResponse({ ok: false, error: validated.error }, 400, cors);
    }
    const id = 'msub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const now = new Date().toISOString();
    await db
      .prepare(
        'INSERT INTO lantern_mission_submissions (id, mission_id, character_name, submission_type, submission_content, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, missionId, characterName, validated.submissionType, validated.content, 'pending', now)
      .run();
    try {
      await awardAchievementsForMissionSubmit(db, characterName, id);
    } catch (_) {}
    return jsonResponse(
      {
        ok: true,
        id,
        mission: {
          id: mission.id,
          title: mission.title,
          reward_amount: mission.reward_amount,
          submission_type: mission.submission_type,
        },
      },
      200,
      cors
    );
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/teacher') {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const isAdmin = isAdminRole(auth.account.role);
    // Admin broader scope: with no explicit ?teacher_id=, admin's pending
    // queue spans every teacher's missions (matches teacherOwnsMission()
    // already granting admin authority to approve/reject/return any
    // submission — this makes those submissions actually visible first).
    let teacherId = isAdmin ? (url.searchParams.get('teacher_id') || '').trim() : sessionTeacherId(auth.account);
    if (!isAdmin && !teacherId) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    const missionRows = teacherId
      ? await db
          .prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE teacher_id = ?')
          .bind(teacherId)
          .all()
      : await db.prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions').all();
    const missionIds = (missionRows.results || []).map((m) => m.id);
    if (missionIds.length === 0) return jsonResponse({ ok: true, submissions: [] }, 200, cors);
    const placeholders = missionIds.map(() => '?').join(',');
    const subRows = await db
      .prepare(
        'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at FROM lantern_mission_submissions WHERE mission_id IN (' +
          placeholders +
          ') AND status = ? ORDER BY created_at ASC'
      )
      .bind(...missionIds, 'pending')
      .all();
    const byMission = {};
    (missionRows.results || []).forEach((m) => {
      byMission[m.id] = {
        title: m.title,
        reward_amount: m.reward_amount,
        teacher_id: m.teacher_id || '',
        teacher_name: m.teacher_name || 'Teacher',
      };
    });
    const list = (subRows.results || []).map((s) => {
      const m = byMission[s.mission_id] || {};
      const content = s.submission_content || '';
      const media = extractMissionSubmissionMedia(s.submission_type, content);
      return {
        id: s.id,
        mission_id: s.mission_id,
        character_name: s.character_name,
        submission_type: s.submission_type,
        submission_content: content,
        status: s.status,
        created_at: s.created_at,
        mission_title: m.title || '',
        mission_reward: m.reward_amount != null ? m.reward_amount : 1,
        created_by_teacher_id: m.teacher_id || '',
        created_by_teacher_name: m.teacher_name || 'Teacher',
        caption: media.caption || undefined,
        image_url: media.image_url || undefined,
        video_url: media.video_url || undefined,
      };
    });
    return jsonResponse({ ok: true, submissions: list }, 200, cors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/approved') {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const subRows = await db
      .prepare(
        'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by FROM lantern_mission_submissions WHERE status = ? AND (hidden_at IS NULL OR hidden_at = ?) ORDER BY reviewed_at DESC, created_at DESC LIMIT ?'
      )
      .bind('accepted', '', limit)
      .all();
    const missionIds = [...new Set((subRows.results || []).map((s) => s.mission_id))];
    let byMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const mRows = await db
        .prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE id IN (' + placeholders + ')')
        .bind(...missionIds)
        .all();
      (mRows.results || []).forEach((m) => {
        byMission[m.id] = {
          title: m.title,
          reward_amount: m.reward_amount,
          teacher_id: m.teacher_id || '',
          teacher_name: m.teacher_name || 'Teacher',
        };
      });
    }
    const list = (subRows.results || []).map((s) => {
      const m = byMission[s.mission_id] || {};
      const media = extractMissionSubmissionMedia(s.submission_type, s.submission_content);
      return {
        id: s.id,
        mission_id: s.mission_id,
        character_name: s.character_name,
        submission_type: s.submission_type,
        submission_content: s.submission_content || '',
        status: s.status,
        created_at: s.created_at,
        reviewed_at: s.reviewed_at,
        reviewed_by: s.reviewed_by || '',
        mission_title: m.title || '',
        mission_reward: m.reward_amount != null ? m.reward_amount : 1,
        created_by_teacher_name: m.teacher_name || 'Teacher',
        caption: media.caption || '',
        image_url: media.image_url || undefined,
        video_url: media.video_url || undefined,
      };
    });
    return jsonResponse({ ok: true, submissions: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/hide') {
    const pilotCors = cors;
    const gate = await deps.requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors);
    }
    const id = deps.parseModerationBodyId(body);
    const hiddenBy = deps.adminAuditLabel(gate.account);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id, status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    const now = new Date().toISOString();
    await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = ?, hidden_by = ? WHERE id = ?').bind(now, hiddenBy, id).run();
    return jsonResponse({ ok: true, id, hidden_at: now }, 200, pilotCors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/restore') {
    const pilotCors = cors;
    const gate = await deps.requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, pilotCors);
    }
    const id = deps.parseModerationBodyId(body);
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, pilotCors);
    const row = await db.prepare('SELECT id FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, pilotCors);
    await db.prepare('UPDATE lantern_mission_submissions SET hidden_at = NULL, hidden_by = NULL WHERE id = ?').bind(id).run();
    return jsonResponse({ ok: true, id }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/hidden') {
    const pilotCors = cors;
    const gate = await deps.requireAdminPilotSession(request, env, pilotCors);
    if (gate.response) return gate.response;
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const subRows = await db
      .prepare(
        'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by, hidden_at, hidden_by FROM lantern_mission_submissions WHERE hidden_at IS NOT NULL AND hidden_at != ? ORDER BY hidden_at DESC LIMIT ?'
      )
      .bind('', limit)
      .all();
    const missionIds = [...new Set((subRows.results || []).map((s) => s.mission_id))];
    let byMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const mRows = await db
        .prepare('SELECT id, title FROM lantern_missions WHERE id IN (' + placeholders + ')')
        .bind(...missionIds)
        .all();
      (mRows.results || []).forEach((m) => {
        byMission[m.id] = { title: m.title || '' };
      });
    }
    const list = (subRows.results || []).map((s) => ({
      id: s.id,
      mission_id: s.mission_id,
      character_name: s.character_name,
      submission_type: s.submission_type,
      submission_content: (s.submission_content || '').slice(0, 500),
      status: s.status,
      created_at: s.created_at,
      reviewed_at: s.reviewed_at,
      hidden_at: s.hidden_at,
      hidden_by: s.hidden_by,
      mission_title: (byMission[s.mission_id] || {}).title || '',
    }));
    return jsonResponse({ ok: true, submissions: list }, 200, pilotCors);
  }

  if (request.method === 'GET' && path === '/api/missions/submissions/character') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const requested = (url.searchParams.get('character_name') || '').trim();
    const identity = resolveSubmissionHistoryIdentity(auth.account, requested, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const characterName = identity.characterName;
    const subRows = await db
      .prepare(
        'SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at, reviewed_at, reviewed_by, returned_reason, returned_at FROM lantern_mission_submissions WHERE character_name = ? ORDER BY created_at DESC'
      )
      .bind(characterName)
      .all();
    const missionIds = [...new Set((subRows.results || []).map((s) => s.mission_id))];
    let byMission = {};
    if (missionIds.length > 0) {
      const placeholders = missionIds.map(() => '?').join(',');
      const mRows = await db
        .prepare('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions WHERE id IN (' + placeholders + ')')
        .bind(...missionIds)
        .all();
      (mRows.results || []).forEach((m) => {
        byMission[m.id] = {
          title: m.title,
          reward_amount: m.reward_amount,
          teacher_id: m.teacher_id || '',
          teacher_name: m.teacher_name || 'Teacher',
        };
      });
    }
    const list = (subRows.results || []).map((s) => mapCharacterSubmissionRow(s, byMission));
    return jsonResponse({ ok: true, submissions: list }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/approve') {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db
      .prepare('SELECT id, mission_id, character_name, status, submission_type, submission_content FROM lantern_mission_submissions WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    const mission = await db.prepare('SELECT reward_amount, teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    if (!mission || !teacherOwnsMission(auth.account, mission.teacher_id)) {
      return jsonResponse({ ok: false, error: 'Not authorized to approve this submission' }, 403, cors);
    }
    // Prompt #107 — staff may participate, but never self-approve / self-reward.
    if (isSelfMissionSubmission(auth.account, row.character_name)) {
      return jsonResponse({ ok: false, error: 'self_approval_forbidden', message: 'You cannot approve or reward your own mission submission.' }, 403, cors);
    }
    // Prompt #159: approval always awards exactly +1 Nugget (do not trust mission row / client).
    const reward = 1;
    const reviewer = reviewerLabelFromAccount(auth.account);
    const result = await approveMissionWithReward(db, {
      submissionId: id,
      recipientCharacterName: row.character_name,
      rewardAmount: reward,
      reviewerLabel: reviewer,
      env,
    });
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error, accepted_without_reward: !!result.accepted_without_reward }, result.code || 500, cors);
    }
    const firstTimeApproval = !result.idempotent;
    if (firstTimeApproval) {
      const now = new Date().toISOString();
      try {
        await awardAchievementsForMissionAccepted(db, result.character_name, id);
        const txId = missionRewardTxId(id);
        await awardAchievementsForEconomyTransact(db, result.character_name, 'teacher_mission', txId, 'Teacher mission approved');
        if (result.nuggets > 0) {
          await awardAchievementsAfterPositiveCredit(db, result.character_name, txId, result.nuggets);
        }
      } catch (_) {}
      const side = await handlePollAndBugSideEffects(db, row, now);
      if (!side.ok) {
        return jsonResponse(side, 503, cors);
      }
    }
    // Prompt #165 — once-ever action completion markers (idempotent; no second reward when
    // an accepted submission already exists for this mission+student).
    try {
      const mid = String(row.mission_id || '');
      if (mid === WAVE2_MISSION_IDS.CREATE_POLL) {
        await ensureContentApprovedMissionCompletion(db, env, 'poll', row.character_name, id);
      } else if (mid === WAVE2_MISSION_IDS.SHOUTOUT) {
        await ensureContentApprovedMissionCompletion(db, env, 'shoutout', row.character_name, id);
      } else if (mid === WAVE2_MISSION_IDS.FIRST_PHOTO) {
        await ensureContentApprovedMissionCompletion(db, env, 'photo', row.character_name, id);
      }
    } catch (_) {}
    return jsonResponse(
      {
        ok: true,
        status: 'accepted',
        nuggets: result.nuggets,
        reward_amount: result.nuggets,
        character_name: result.character_name,
        reward_applied: true,
        idempotent: !!result.idempotent,
        already_approved: !!result.idempotent,
      },
      200,
      cors
    );
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/reject') {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db.prepare('SELECT id, mission_id, status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    if (!mission || !teacherOwnsMission(auth.account, mission.teacher_id)) {
      return jsonResponse({ ok: false, error: 'Not authorized to reject this submission' }, 403, cors);
    }
    if ((row.status || '') !== 'pending') {
      return jsonResponse({ ok: false, error: 'Can only reject pending submissions' }, 400, cors);
    }
    const now = new Date().toISOString();
    const reviewer = reviewerLabelFromAccount(auth.account);
    await db
      .prepare('UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?')
      .bind('rejected', reviewer, now, id, 'pending')
      .run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/return') {
    const auth = await requireMissionTeacher(deps, request, env, cors);
    if (auth.response) return auth.response;
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const reason = (body.reason || body.decision_note || '').trim().slice(0, 500);
    const row = await db.prepare('SELECT id, mission_id, status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    if (!mission || !teacherOwnsMission(auth.account, mission.teacher_id)) {
      return jsonResponse({ ok: false, error: 'Not authorized to return this submission' }, 403, cors);
    }
    if ((row.status || '') !== 'pending') {
      return jsonResponse({ ok: false, error: 'Can only return pending submissions' }, 400, cors);
    }
    const now = new Date().toISOString();
    const reviewer = reviewerLabelFromAccount(auth.account);
    await db
      .prepare(
        'UPDATE lantern_mission_submissions SET status = ?, returned_reason = ?, returned_by = ?, returned_at = ? WHERE id = ? AND status = ?'
      )
      .bind('returned', reason, reviewer, now, id, 'pending')
      .run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  if (request.method === 'POST' && path === '/api/missions/submissions/resubmit') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveParticipantMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const text = await request.text();
    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const id = (body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Missing id' }, 400, cors);
    const row = await db
      .prepare('SELECT id, character_name, status, submission_type FROM lantern_mission_submissions WHERE id = ?')
      .bind(id)
      .first();
    if (!row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
    if (String(row.character_name || '').trim() !== identity.characterName) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
    if ((row.status || '') !== 'returned') {
      return jsonResponse({ ok: false, error: 'Can only resubmit returned submissions' }, 400, cors);
    }
    const stRes = row.submission_type ? String(row.submission_type).trim() : '';
    const contentMaxRes = stRes === 'poll' || stRes === 'bug_report' ? 4000 : 2000;
    const content = String(body.submission_content || '').trim().slice(0, contentMaxRes);
    await db
      .prepare(
        'UPDATE lantern_mission_submissions SET submission_content = ?, status = ?, returned_reason = ?, returned_by = ?, returned_at = ? WHERE id = ? AND status = ?'
      )
      .bind(content, 'pending', null, null, null, id, 'returned')
      .run();
    return jsonResponse({ ok: true }, 200, cors);
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}
