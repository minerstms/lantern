/**
 * Prompt #257C1 — authoritative global student-facing mission eligibility.
 *
 * A "global Mission" is any mission published school-wide (audience = school_mission),
 * regardless of id prefix (perm_* or tmission_*). Scoped missions (selected_students,
 * my_students) are excluded from Activity Admin.
 */
import { isEducationalTriviaMissionId, isVerifiedActivityRunStateRow } from './educational-trivia-missions.js';
import { FIGHT_SONG_MISSION_ID } from './fight-song-challenge.js';
import { WAVE2_MISSION_IDS } from './mission-event-completions.js';

export const EVIDENCE_SUBMISSION = 'submission';
export const EVIDENCE_VERIFIED_ACTIVITY = 'verified_activity';

export function normalizeMissionAudience(raw) {
  return String(raw || 'school_mission').trim();
}

export function isSchoolWideMissionAudience(audience) {
  const aud = normalizeMissionAudience(audience);
  return aud === 'school_mission' || aud === '';
}

export function isRestrictedMissionAudience(audience) {
  const aud = normalizeMissionAudience(audience);
  return aud === 'selected_students' || aud === 'my_students';
}

/** Matches missions intended for the school-wide student catalog (not class/private scoped). */
export function isGlobalStudentFacingMission(row) {
  if (!row || !String(row.id || '').trim()) return false;
  if (isRestrictedMissionAudience(row.audience)) return false;
  return isSchoolWideMissionAudience(row.audience);
}

/** Would appear in GET /api/missions/active today (active + unarchived + school-wide). */
export function isPublishedGlobalMission(row) {
  if (!isGlobalStudentFacingMission(row)) return false;
  if (row.archived === 1 || row.archived === true) return false;
  if (row.active === 0 || row.active === false) return false;
  return true;
}

const VERIFIED_EVENT_MISSION_IDS = new Set([
  WAVE2_MISSION_IDS.DAILY_CHECKIN,
  WAVE2_MISSION_IDS.FIRST_GAME,
  WAVE2_MISSION_IDS.THANK_YOU,
  WAVE2_MISSION_IDS.CREATE_POLL,
  WAVE2_MISSION_IDS.FIGHT_SONG,
  FIGHT_SONG_MISSION_ID,
]);

/**
 * Submission missions require written work (min > 0 on save).
 * Verified-activity missions use server/game/quiz/confirmation evidence instead.
 */
export function classifyMissionEvidenceKind(row, registryKind) {
  const rk = String(registryKind || '').trim();
  if (rk === 'trivia' || rk === 'event') return EVIDENCE_VERIFIED_ACTIVITY;
  const id = String(row && row.id).trim();
  if (isEducationalTriviaMissionId(id)) return EVIDENCE_VERIFIED_ACTIVITY;
  if (VERIFIED_EVENT_MISSION_IDS.has(id)) return EVIDENCE_VERIFIED_ACTIVITY;
  const st = String((row && row.submission_type) || '').trim();
  if (st === 'confirmation' || st === 'poll' || st === 'bug_report') return EVIDENCE_VERIFIED_ACTIVITY;
  return EVIDENCE_SUBMISSION;
}

/** Admin/UI label for how a mission completes. */
export function missionCompletionModeLabel(evidenceKind) {
  return evidenceKind === EVIDENCE_VERIFIED_ACTIVITY ? 'Verified automatically' : 'Staff review';
}

/**
 * True when a lantern_mission_submissions row is awaiting human teacher review.
 * Excludes verified-activity run-state rows (#257C3).
 */
export function isHumanReviewMissionSubmission(row) {
  if (!row) return false;
  if (String(row.status || '').trim().toLowerCase() !== 'pending') return false;
  if (isVerifiedActivityRunStateRow(row)) return false;
  return true;
}

export function missionProvenance(row) {
  const id = String(row && row.id || '').trim();
  const teacherName = String(row && row.teacher_name || '').trim();
  const teacherId = String(row && row.teacher_id || '').trim();
  if (id.startsWith('perm_')) {
    return {
      source: 'system',
      label: 'System / Global',
      teacher_id: teacherId,
      teacher_name: teacherName || 'Lantern',
    };
  }
  if (teacherName) {
    return {
      source: 'teacher',
      label: 'Created by ' + teacherName,
      teacher_id: teacherId,
      teacher_name: teacherName,
    };
  }
  return {
    source: 'teacher',
    label: 'Created by Teacher',
    teacher_id: teacherId,
    teacher_name: 'Teacher',
  };
}

/** SQL fragment: school-wide missions eligible for Activity Admin (includes inactive/archived). */
export const GLOBAL_MISSION_ADMIN_WHERE =
  "(audience IS NULL OR trim(audience) = '' OR trim(audience) = 'school_mission')";
