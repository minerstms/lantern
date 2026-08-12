/**
 * Missions authorization — session-derived student identity (Prompt #66).
 */

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function isTeacherLike(role) {
  const r = normalizeRole(role);
  return r === 'teacher' || r === 'admin';
}

/** Prompt #13 — teacher / admin / staff are staff-side mission participants (bypass student review). */
export function isStaffSideParticipantRole(role) {
  const r = normalizeRole(role);
  return r === 'teacher' || r === 'admin' || r === 'staff';
}

export function isAdminRole(role) {
  return normalizeRole(role) === 'admin';
}

export function isStudentRole(role) {
  return normalizeRole(role) === 'student';
}

/**
 * Session teacher id for mission ownership checks.
 * Admin accounts have no roster teacher_id but still get a stable identity
 * (their own account key) so admin-created missions have a real owner
 * instead of an orphaned placeholder. Admin's broader "see everything"
 * scope for listing/reading is handled separately in the route handlers —
 * this function only supplies a default *identity*, it does not grant scope.
 */
export function sessionTeacherId(account) {
  if (!account) return '';
  const role = normalizeRole(account.role);
  if (role === 'teacher' || role === 'admin') {
    return String(account.teacher_id || account.username || '').trim();
  }
  return '';
}

export function reviewerLabelFromAccount(account) {
  if (!account) return 'Teacher';
  const dn = account.display_name != null ? String(account.display_name).trim() : '';
  const u = account.username != null ? String(account.username).trim() : '';
  return dn || u || 'Teacher';
}

/**
 * Student self-service mission identity — always session-derived.
 * Kept for callers that still need a student-only gate; participant surfaces use
 * resolveParticipantMissionIdentity (Prompt #107).
 */
export function resolveStudentMissionIdentity(account, pilotEconomyCharacterName) {
  if (!account) {
    return { ok: false, code: 401, error: 'not_authenticated' };
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return { ok: false, code: 403, error: 'must_change_password', redirect: '/change-password.html' };
  }
  if (!isStudentRole(account.role)) {
    return { ok: false, code: 403, error: 'forbidden' };
  }
  const characterName = pilotEconomyCharacterName(account) || '';
  if (!characterName) {
    return { ok: false, code: 400, error: 'account_link_missing' };
  }
  return { ok: true, characterName, participantKind: 'student', session_scoped: true };
}

/**
 * Prompt #107 — any authenticated Lantern participant (student, teacher, admin) may use
 * base mission surfaces. Staff submitter key is staff:<lantern_username> (stable, never a
 * fabricated mtss_student_id / character roster row).
 */
export function staffMissionSubmitterKey(account) {
  const u = account && account.username != null ? String(account.username).trim() : '';
  return u ? ('staff:' + u) : '';
}

export function resolveParticipantMissionIdentity(account, pilotEconomyCharacterName) {
  if (!account) {
    return { ok: false, code: 401, error: 'not_authenticated' };
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return { ok: false, code: 403, error: 'must_change_password', redirect: '/change-password.html' };
  }
  if (isStudentRole(account.role)) {
    const characterName = pilotEconomyCharacterName(account) || '';
    if (!characterName) {
      return { ok: false, code: 400, error: 'account_link_missing' };
    }
    return { ok: true, characterName, participantKind: 'student', session_scoped: true };
  }
  if (isStaffSideParticipantRole(account.role)) {
    const characterName = staffMissionSubmitterKey(account);
    if (!characterName) {
      return { ok: false, code: 400, error: 'account_link_missing' };
    }
    return {
      ok: true,
      characterName,
      participantKind: 'staff',
      displayName: reviewerLabelFromAccount(account),
      session_scoped: true,
    };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}

export function normalizeParticipantScope(raw) {
  const s = String(raw || 'students').trim().toLowerCase();
  if (s === 'staff' || s === 'everyone' || s === 'students') return s;
  return 'students';
}

/**
 * Whether an active mission is eligible for this participant to open / submit.
 * Prompt #10 — normal active manual missions are universal for every authenticated
 * Lantern participant (student / teacher / admin). Historical participant_scope and
 * audience columns are preserved in D1 but are NOT authorization gates.
 * Special flows (Thank-a-Teacher send limit, Daily Check-In cadence, First Game event)
 * keep their own endpoint rules separately from this gate.
 */
export function missionVisibleToParticipant(missionRow, identity) {
  if (!identity || !identity.ok) return false;
  if (!missionRow) return false;
  return true;
}

/** Alias — open/submit eligibility (same rules as missionVisibleToParticipant). */
export function missionEligibleForParticipant(missionRow, identity) {
  return missionVisibleToParticipant(missionRow, identity);
}

/**
 * Catalog visibility for Missions page.
 * Prompt #10 — authenticated participants see the active mission catalog without
 * participant_scope / audience filtering. Inactive/archived rows are excluded upstream.
 */
export function missionInCatalogForParticipant(missionRow, identity) {
  if (!identity || !identity.ok) return false;
  if (!missionRow) return false;
  return true;
}

/**
 * Approver must not be the same participant who submitted (self-reward deny).
 */
export function isSelfMissionSubmission(account, submissionCharacterName) {
  const sub = String(submissionCharacterName || '').trim();
  if (!account || !sub) return false;
  const staffKey = staffMissionSubmitterKey(account);
  if (staffKey && sub === staffKey) return true;
  const tid = sessionTeacherId(account);
  if (tid && sub === tid) return true;
  const un = account.username != null ? String(account.username).trim() : '';
  if (un && sub === un) return true;
  if (isStudentRole(account.role)) {
    // Students are not approvers in practice; still compare economy keys defensively.
    return false;
  }
  return false;
}

function pilotAccountRequiresChangePassword(account) {
  if (!account) return false;
  return account.must_change_password != null && Number(account.must_change_password) !== 0;
}

export function parseTargetCharacterNames(raw) {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Whether an active mission is visible to a student by audience rules.
 * Prompt #10 — retained for historical callers/tests; eligibility/catalog no longer use this
 * as an authorization gate for normal manual missions.
 * my_students: no roster table exists — cannot authorize under the old model.
 */
export function missionVisibleToStudent(missionRow, studentKey) {
  const key = String(studentKey || '').trim();
  if (!key) return false;
  const aud = String(missionRow.audience || 'school_mission').trim();
  if (aud === 'school_mission') return true;
  if (aud === 'selected_students') {
    const t = parseTargetCharacterNames(missionRow.target_character_names);
    return Array.isArray(t) && t.indexOf(key) >= 0;
  }
  if (aud === 'my_students') {
    return false;
  }
  return false;
}

/**
 * PATCH /api/missions/:id field-level authorization (Prompt #103 audit, CURSOR REPLY #100 §5).
 * Fields here are safe to edit only before a mission has ever received its first submission
 * (regardless of that submission's later status) — changing audience/requirements mid-flight
 * would silently break students who already submitted under the old rules. `title`,
 * `description`, `active`, `featured`, `archived`, and `reward_amount` are intentionally NOT
 * listed here: they remain safe to edit at any time (reward_amount only affects FUTURE
 * approvals — historical paid rewards are frozen by missions-reward.js's idempotent tx id).
 */
export const MISSION_FIELDS_LOCKED_AFTER_FIRST_SUBMISSION = [
  'audience',
  'participant_scope',
  'target_character_names',
  'allows_text',
  'allows_image',
  'allows_video',
  'allows_link',
  'min_characters',
];

/**
 * Returns which locked-after-first-submission fields a PATCH body is attempting to change.
 * Empty array means the request contains none of them (always safe re: this rule).
 */
export function missionEditLockedFieldsPresent(body) {
  if (!body || typeof body !== 'object') return [];
  return MISSION_FIELDS_LOCKED_AFTER_FIRST_SUBMISSION.filter((f) => body[f] !== undefined);
}

/**
 * A mission may be hard-deleted only if it has zero submissions/dependent history. Anything
 * else (submissions, approvals, rewards, published content, polls/bug-reports keyed off a
 * submission id) must go through Archive instead — this is the only signal we need because all
 * of those other rows are keyed off lantern_mission_submissions.id, which cannot exist without a
 * submissions row existing first.
 */
export function missionIsUnusedAndDeletable(submissionCount) {
  return (Number(submissionCount) || 0) === 0;
}

export function teacherOwnsMission(account, missionTeacherId) {
  if (!account) return false;
  if (isAdminRole(account.role)) return true;
  if (normalizeRole(account.role) !== 'teacher') return false;
  const tid = sessionTeacherId(account);
  const mid = String(missionTeacherId || '').trim();
  return !!tid && tid === mid;
}

/**
 * Admin may read another student's submissions via explicit character_name.
 * Students always get session identity only.
 */
export function resolveSubmissionHistoryIdentity(account, requestedCharacterName, pilotEconomyCharacterName) {
  if (!account) {
    return { ok: false, code: 401, error: 'not_authenticated' };
  }
  if (pilotAccountRequiresChangePassword(account)) {
    return { ok: false, code: 403, error: 'must_change_password', redirect: '/change-password.html' };
  }
  const role = normalizeRole(account.role);
  if (role === 'student') {
    const self = resolveStudentMissionIdentity(account, pilotEconomyCharacterName);
    if (!self.ok) return self;
    return { ok: true, characterName: self.characterName, session_scoped: true };
  }
  if (role === 'teacher') {
    return { ok: false, code: 403, error: 'forbidden' };
  }
  if (role === 'admin') {
    const requested = String(requestedCharacterName || '').trim();
    if (!requested) {
      return { ok: false, code: 400, error: 'Missing character_name' };
    }
    return { ok: true, characterName: requested, session_scoped: false };
  }
  return { ok: false, code: 403, error: 'forbidden' };
}

export async function requireMissionSession(deps, request, env, cors) {
  const account = await deps.getPilotAccountFromRequest(request, env);
  if (!account) {
    return { response: deps.jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors) };
  }
  if (deps.pilotAccountRequiresChangePassword(account)) {
    return {
      response: deps.jsonResponse(
        { ok: false, error: 'must_change_password', redirect: '/change-password.html' },
        403,
        cors
      ),
    };
  }
  return { account };
}

export async function requireMissionTeacher(deps, request, env, cors) {
  const auth = await requireMissionSession(deps, request, env, cors);
  if (auth.response) return auth;
  if (!isTeacherLike(auth.account.role)) {
    return { response: deps.jsonResponse({ ok: false, error: 'forbidden' }, 403, cors) };
  }
  return auth;
}

const ALLOWED_SUBMISSION_TYPES = ['text', 'link', 'image_url', 'video', 'confirmation', 'poll', 'bug_report'];

export function normalizeSubmissionType(raw, missionDefault) {
  const st = String(raw || missionDefault || 'text').trim();
  return ALLOWED_SUBMISSION_TYPES.includes(st) ? st : 'text';
}

/**
 * A "text" submission may carry a JSON envelope { text, image_url } instead of a plain
 * string, when the student attached a photo alongside their text response (mission
 * allows_image = true). Mirrors the existing poll/bug_report JSON-in-content convention.
 */
function parseTextEnvelope(raw) {
  const s = String(raw || '').trim();
  if (s.length < 2 || s.charCodeAt(0) !== 123 /* '{' */) return { isEnvelope: false, text: '', image_url: '' };
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

/**
 * Extract display media/caption fields for a stored mission submission row, regardless of
 * whether submission_type is 'text' (plain, or a JSON { text, image_url } envelope),
 * 'image_url', or 'video'. Used by both the teacher pending queue and the approved-submissions
 * API so student media/text survives read paths identically. Read-only; does not mutate content.
 */
export function extractMissionSubmissionMedia(submissionType, submissionContent) {
  const st = String(submissionType || '').trim();
  const raw = submissionContent != null ? String(submissionContent) : '';
  let caption = '';
  let imageUrl = null;
  let videoUrl = null;
  if (st === 'image_url' && raw) {
    imageUrl = raw.trim().slice(0, 2000);
  } else if (st === 'video' && raw) {
    videoUrl = raw.trim().slice(0, 2000);
  } else if (st === 'text' && raw) {
    const envelope = parseTextEnvelope(raw);
    if (envelope.isEnvelope) {
      caption = envelope.text.slice(0, 200);
      if (envelope.image_url) imageUrl = envelope.image_url.slice(0, 1000);
    } else {
      caption = raw.trim().slice(0, 200);
    }
  }
  return { caption, image_url: imageUrl, video_url: videoUrl };
}

export function validateMissionSubmissionPayload(mission, submissionType, content) {
  const st = normalizeSubmissionType(submissionType, mission.submission_type);
  const text = String(content || '').trim();
  const allowsText = mission.allows_text !== 0 && mission.allows_text !== false;
  const allowsImage = !!(mission.allows_image);
  const allowsVideo = !!(mission.allows_video);
  const allowsLink = !!(mission.allows_link);
  const minChars =
    mission.min_characters !== undefined && mission.min_characters !== null
      ? Math.max(0, Math.floor(Number(mission.min_characters)) || 0)
      : 0;

  if (st === 'poll') {
    if (!text) return { ok: false, error: 'Missing poll payload' };
    try {
      const p = JSON.parse(text);
      if (!p || typeof p.question !== 'string' || !Array.isArray(p.choices) || p.choices.length < 2) {
        return { ok: false, error: 'Invalid poll payload' };
      }
    } catch (_) {
      return { ok: false, error: 'Invalid poll payload' };
    }
    return { ok: true, submissionType: st, content: text };
  }

  if (st === 'bug_report') {
    if (!text) return { ok: false, error: 'Missing bug report payload' };
    try {
      const b = JSON.parse(text);
      if (!b || !String(b.description || '').trim()) {
        return { ok: false, error: 'Description required' };
      }
    } catch (_) {
      return { ok: false, error: 'Invalid bug report payload' };
    }
    return { ok: true, submissionType: st, content: text };
  }

  if (st === 'confirmation') {
    return { ok: true, submissionType: st, content: text || 'confirmed' };
  }

  let valid = false;
  if (st === 'text' && allowsText) {
    const envelope = allowsImage ? parseTextEnvelope(text) : { isEnvelope: false, text: '', image_url: '' };
    if (envelope.isEnvelope) {
      const innerText = envelope.text;
      const innerImage = envelope.image_url;
      if (minChars > 0 && innerText.length > 0 && innerText.length < minChars) {
        return { ok: false, error: `Minimum ${minChars} characters required` };
      }
      const hasText = innerText.length > 0;
      const hasImage = allowsImage && innerImage.length > 0;
      if (!hasText && !hasImage) {
        return { ok: false, error: 'Invalid submission for mission requirements' };
      }
      const outContent = hasImage
        ? JSON.stringify({ text: innerText.slice(0, 1800), image_url: innerImage.slice(0, 500) })
        : innerText;
      return { ok: true, submissionType: st, content: outContent };
    }
    if (minChars > 0 && text.length < minChars) {
      return { ok: false, error: `Minimum ${minChars} characters required` };
    }
    if (text.length > 0) valid = true;
  }
  if (st === 'image_url' && allowsImage && text.length > 0) valid = true;
  if (st === 'video' && allowsVideo && text.length > 0) valid = true;
  if (st === 'link' && allowsLink && text.length > 0) valid = true;

  if (!valid) {
    return { ok: false, error: 'Invalid submission for mission requirements' };
  }
  return { ok: true, submissionType: st, content: text };
}
