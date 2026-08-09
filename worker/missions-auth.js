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
  return { ok: true, characterName, session_scoped: true };
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
 * my_students: no roster table exists — cannot authorize; hidden from students.
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
