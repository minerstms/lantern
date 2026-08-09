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
  missionVisibleToStudent,
  normalizeSubmissionType,
  parseTargetCharacterNames,
  requireMissionSession,
  requireMissionTeacher,
  extractMissionSubmissionMedia,
  resolveStudentMissionIdentity,
  resolveSubmissionHistoryIdentity,
  reviewerLabelFromAccount,
  sessionTeacherId,
  teacherOwnsMission,
  validateMissionSubmissionPayload,
} from './missions-auth.js';
import { approveMissionWithReward, missionRewardTxId } from './missions-reward.js';

function missionRowToJson(r) {
  let target = parseTargetCharacterNames(r.target_character_names);
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    reward_amount: Number(r.reward_amount) || 3,
    submission_type: r.submission_type || 'text',
    created_by_teacher_id: r.teacher_id || 'teacher',
    created_by_teacher_name: r.teacher_name || 'Teacher',
    audience: r.audience || 'school_mission',
    target_character_names: target,
    featured: !!r.featured,
    active: r.active !== 0,
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
      'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE id = ?'
    )
    .bind(missionId)
    .first();
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
    const identity = resolveStudentMissionIdentity(auth.account, pilotEconomyCharacterName);
    if (!identity.ok) {
      return jsonResponse({ ok: false, error: identity.error }, identity.code || 403, cors);
    }
    const characterName = identity.characterName;
    const rows = await db
      .prepare(
        'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE active = 1 ORDER BY featured DESC, created_at DESC'
      )
      .all();
    let list = (rows.results || []).map((r) => missionRowToJson(r));
    list = list.filter((m) => missionVisibleToStudent(m, characterName));
    return jsonResponse({ ok: true, missions: list }, 200, cors);
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
            'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions WHERE teacher_id = ? ORDER BY created_at DESC'
          )
          .bind(teacherId)
          .all()
      : await db
          .prepare(
            'SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions ORDER BY created_at DESC'
          )
          .all();
    const list = (rows.results || []).map((r) => missionRowToJson(r));
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
    const rewardAmount = Math.max(1, Math.min(99, Math.floor(Number(body.reward_amount) || 3)));
    const submissionType = normalizeSubmissionType(body.submission_type, 'text');
    const audience = ['my_students', 'selected_students', 'school_mission'].includes((body.audience || 'school_mission').trim())
      ? (body.audience || 'school_mission').trim()
      : 'school_mission';
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
        'INSERT INTO lantern_missions (id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
      target_character_names: targetNames || undefined,
      featured,
      active,
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
    const updates = [];
    const bindings = [];
    if (body.active !== undefined) {
      updates.push('active = ?');
      bindings.push(body.active ? 1 : 0);
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
      updates.push('reward_amount = ?');
      bindings.push(Math.max(1, Math.min(99, Math.floor(Number(body.reward_amount) || 1))));
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

  if (request.method === 'POST' && path === '/api/missions/submit') {
    const auth = await requireMissionSession(deps, request, env, cors);
    if (auth.response) return auth.response;
    const identity = resolveStudentMissionIdentity(auth.account, pilotEconomyCharacterName);
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
    if (mission.active === 0) return jsonResponse({ ok: false, error: 'Mission is not active' }, 400, cors);
    if (!missionVisibleToStudent(mission, characterName)) {
      return jsonResponse({ ok: false, error: 'Mission not available' }, 403, cors);
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
    const reward = mission ? Math.max(1, Math.min(99, Number(mission.reward_amount) || 1)) : 1;
    const reviewer = reviewerLabelFromAccount(auth.account);
    const result = await approveMissionWithReward(db, {
      submissionId: id,
      recipientCharacterName: row.character_name,
      rewardAmount: reward,
      reviewerLabel: reviewer,
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
    const identity = resolveStudentMissionIdentity(auth.account, pilotEconomyCharacterName);
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
