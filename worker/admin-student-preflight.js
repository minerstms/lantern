/**
 * Prompt #40 — Add Student conflict preview before creating another roster row.
 */
import { findTmsStudentsById } from './admin-add-student.js';
import { normalizeHealthName } from './admin-student-health.js';

export const STUDENT_PREFLIGHT_PATH = '/api/admin/students/preflight-create';

function fail(error, status, extra) {
  return Object.assign({ ok: false, error, status: status || 400 }, extra || {});
}

export async function preflightCreateStudent(db, env, body, deps) {
  const first = String((body && body.first_name) || '').trim();
  const last = String((body && body.last_name) || '').trim();
  const studentName = String((body && body.student_name) || '').trim() || [first, last].filter(Boolean).join(' ').trim();
  const studentId = String((body && body.student_id) || '').trim();
  if (!first && !studentName) return fail('first_name_required', 400, { message: 'First name is required.' });
  if (!studentId) return fail('student_id_required', 400, { message: 'School Student ID is required.' });

  const list = await deps.callTmsRosterBridge(env, 'roster/list', { include_inactive: true });
  if (!list || list.ok === false) {
    return fail(list && (list.error || list.code) || 'bridge_failed', list && list._httpStatus ? list._httpStatus : 502, {
      message: (list && (list.message || list.error)) || 'Could not check existing students.',
    });
  }
  const students = Array.isArray(list.students) ? list.students : [];
  const byId = findTmsStudentsById(students, studentId);
  const nameWant = normalizeHealthName(studentName);
  const byName = students.filter((s) => normalizeHealthName(s && s.student_name) === nameWant);

  const loginByUsername = await db
    .prepare(
      `SELECT username, role, mtss_student_id, is_active FROM lantern_pilot_accounts
       WHERE lower(trim(username)) = lower(trim(?))`
    )
    .bind(studentId)
    .first();
  const loginByMtss = await db
    .prepare(
      `SELECT username, role, mtss_student_id, is_active FROM lantern_pilot_accounts
       WHERE mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?))`
    )
    .bind(studentId)
    .all();
  const mtssLogins = (loginByMtss && loginByMtss.results) || [];

  const existing = byId[0] || null;
  const sameNameOther = byName.filter((s) => String(s.student_id || '').trim().toLowerCase() !== studentId.toLowerCase());
  const archivedMatch = byId.find((s) => Number(s.is_active) === 0) || byName.find((s) => Number(s.is_active) === 0) || null;

  const conflicts = [];
  if (existing) {
    conflicts.push({
      kind: 'existing_school_id',
      message:
        String(existing.student_name || studentName) +
        ' already exists with School ID ' +
        studentId +
        '.',
      student_name: String(existing.student_name || ''),
      student_id: studentId,
      is_active: Number(existing.is_active) === 1 ? 1 : 0,
    });
  }
  if (sameNameOther.length) {
    const peer = sameNameOther[0];
    conflicts.push({
      kind: 'same_name',
      message:
        String(peer.student_name || studentName) +
        ' already exists' +
        (String(peer.student_id || '').trim() ? ' with School ID ' + String(peer.student_id).trim() : ' without a School ID') +
        '.',
      student_name: String(peer.student_name || ''),
      student_id: String(peer.student_id || ''),
      is_active: Number(peer.is_active) === 1 ? 1 : 0,
    });
  }
  if (archivedMatch && !existing) {
    conflicts.push({
      kind: 'archived_student',
      message:
        String(archivedMatch.student_name || studentName) +
        ' is archived' +
        (String(archivedMatch.student_id || '').trim() ? ' with School ID ' + String(archivedMatch.student_id).trim() : '') +
        '.',
      student_name: String(archivedMatch.student_name || ''),
      student_id: String(archivedMatch.student_id || ''),
      is_active: 0,
    });
  }
  if (mtssLogins.length) {
    conflicts.push({
      kind: 'existing_lantern_login',
      message: 'A Lantern login is already linked to School ID ' + studentId + '.',
      username: String(mtssLogins[0].username || ''),
    });
  } else if (loginByUsername && String(loginByUsername.role || '').toLowerCase() === 'student') {
    conflicts.push({
      kind: 'existing_lantern_username',
      message: 'A Lantern login already uses this School ID as its username.',
      username: String(loginByUsername.username || ''),
    });
  }

  const blocking = conflicts.some((c) => c.kind === 'existing_school_id');
  return {
    ok: true,
    can_create: !blocking,
    has_conflict: conflicts.length > 0,
    student_name: studentName,
    student_id: studentId,
    existing_student: existing
      ? {
          student_name: String(existing.student_name || ''),
          student_id: String(existing.student_id || studentId),
          is_active: Number(existing.is_active) === 1 ? 1 : 0,
        }
      : null,
    conflicts,
    use_existing: blocking,
  };
}
